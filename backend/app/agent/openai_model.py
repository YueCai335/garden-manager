"""OpenAI Responses API adapter for the allocation agent (ADR-0056).

The adapter sends request.to_params() unchanged and turns the response into a
ModelTurn. It adds nothing to the request, so the loop's byte check covers
everything sent. Service failures raise ModelProviderError; responses that
arrive but cannot be used come back as ModelTurn.unusable.
"""

import openai
from openai import OpenAI

from .loop import ModelProviderError, ModelRequest, ModelTurn, ToolCall


DEFAULT_MODEL = "gpt-4o-mini-2024-07-18"
REQUEST_TIMEOUT_SECONDS = 30.0


class OpenAIAllocationModel:
    def __init__(self, api_key: str, name: str = DEFAULT_MODEL, client=None):
        self.name = name
        self.owns_client = client is None
        # max_retries=0: every retry must be a request the loop counts.
        self.client = client or OpenAI(api_key=api_key, max_retries=0, timeout=REQUEST_TIMEOUT_SECONDS)

    def respond(self, request: ModelRequest) -> ModelTurn:
        try:
            response = self.client.responses.create(**request.to_params())
        except openai.OpenAIError as error:
            raise ModelProviderError(f"OpenAI request failed: {type(error).__name__}") from error
        try:
            return turn_from_response(response)
        except (AttributeError, KeyError, TypeError, ValueError):
            # The request was paid for, so keep its usage for the log even
            # though the response shape is not one this adapter understands.
            return ModelTurn(unusable="malformed_response", **usage_tokens(response))

    def close(self) -> None:
        if self.owns_client:
            self.client.close()


def usage_tokens(response) -> dict:
    usage = getattr(response, "usage", None)
    return {
        "input_tokens": getattr(usage, "input_tokens", None),
        "output_tokens": getattr(usage, "output_tokens", None),
    }


def turn_from_response(response) -> ModelTurn:
    tokens = usage_tokens(response)

    if response.status == "incomplete":
        reason = getattr(response.incomplete_details, "reason", None)
        if reason == "max_output_tokens":
            return ModelTurn(truncated=True, **tokens)
        return ModelTurn(unusable="incomplete_output", **tokens)
    if response.status != "completed":
        # "failed" and "cancelled" carry a service error, not model output.
        raise ModelProviderError(f"OpenAI response status {response.status}")

    calls, texts, refused = [], [], False
    for item in response.output:
        if item.type == "function_call":
            calls.append(item)
        elif item.type == "message":
            for content in item.content:
                if content.type == "refusal":
                    refused = True
                elif content.type == "output_text":
                    texts.append(content.text)

    if refused:
        return ModelTurn(unusable="refusal", **tokens)
    if len(calls) > 1:
        # parallel_tool_calls is off; if several still arrive, run none of them.
        return ModelTurn(unusable="multiple_tool_calls", **tokens)
    if calls:
        call = calls[0]
        return ModelTurn(tool_call=ToolCall(call.call_id, call.name, call.arguments), **tokens)
    text = "".join(texts)
    if not text.strip():
        return ModelTurn(unusable="empty_output", **tokens)
    return ModelTurn(text=text, **tokens)
