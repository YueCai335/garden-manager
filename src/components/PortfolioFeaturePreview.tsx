"use client";

import { useEffect, useState } from "react";

import { loadRuntimeConfig, type RuntimeConfig } from "@/lib/gardenWorkspaceApi";
import { Button } from "@/components/ui/Button";
import { SLOW_LOAD_HINT, useSlowLoadHint } from "@/hooks/useSlowLoadHint";

type Feature = "care-note" | "plant-health" | "plant-knowledge";

const featureNames: Record<Feature, string> = {
  "care-note": "AI Garden Note",
  "plant-health": "Plant Doctor",
  "plant-knowledge": "Plant Guide",
};

/**
 * The server's runtime settings. `config` stays undefined while loading and
 * after a failure, so a caller can refuse to act on settings it never saw.
 */
export function useRuntimeConfig() {
  const [config, setConfig] = useState<RuntimeConfig>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    void loadRuntimeConfig()
      .then((loaded) => {
        if (active) setConfig({ portfolioDemo: Boolean(loaded.portfolioDemo), careNotePublicAvailable: Boolean(loaded.careNotePublicAvailable), careNoteBatchAvailable: !loaded.portfolioDemo && loaded.careNoteBatchAvailable === true, careNoteBatchPublicAvailable: Boolean(loaded.portfolioDemo) && loaded.careNoteBatchPublicAvailable === true });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return { config, failed, retry: () => setAttempt((current) => current + 1) };
}

/** Demo mode for the preview-only screens; an unreachable server counts as the local app. */
export function usePortfolioDemoMode() {
  const { config, failed } = useRuntimeConfig();
  return failed ? false : config?.portfolioDemo;
}

export function PortfolioFeaturePreview({ feature }: { feature: Feature }) {
  const content = previewContent(feature);

  return (
    <section className="operations-content season-planner portfolio-feature-preview" aria-labelledby={`${feature}-preview-heading`}>
      <div className="section-header">
        <div>
          <p className="section-eyebrow">Local AI feature</p>
          <h2 id={`${feature}-preview-heading`}>{content.heading}</h2>
          <p className="section-context">{content.description}</p>
        </div>
      </div>
      <section className="feature-preview-sample" aria-labelledby={`${feature}-sample-heading`}>
        <p className="section-eyebrow">Sample review state</p>
        <h3 id={`${feature}-sample-heading`}>{content.sampleTitle}</h3>
        {content.body}
      </section>
      <p className="feature-preview-future">This is a read-only example. Live generation for this feature is available in the local app.</p>
    </section>
  );
}

export function PortfolioFeatureLoading({ feature }: { feature: Feature }) {
  const featureName = featureNames[feature];
  const slow = useSlowLoadHint();
  return (
    <section className="operations-content season-planner portfolio-feature-preview" aria-labelledby={`${feature}-loading-heading`}>
      <h2 id={`${feature}-loading-heading`}>Loading {featureName}</h2>
      <p className="section-context" role="status">{slow ? SLOW_LOAD_HINT : "Checking feature availability…"}</p>
    </section>
  );
}

export function PortfolioFeatureSettingsError({ featureName, onRetry }: { featureName: string; onRetry: () => void }) {
  return <section className="operations-content">
    <h2>Feature settings unavailable</h2>
    <p role="alert">We couldn&apos;t check whether {featureName} is available. Check your connection and try again.</p>
    <Button onClick={onRetry}>Try again</Button>
  </section>;
}

function previewContent(feature: Feature) {
  if (feature === "care-note") {
    return {
      heading: "AI Garden Note runs in the local app",
      description: "The local Ollama workflow turns a Chinese or English care note into a draft that the gardener reviews before saving.",
      sampleTitle: "Completed care note",
      body: <>
        <p className="feature-preview-label">Note</p>
        <p>Watered the tomatoes in the back garden bed today.</p>
        <dl className="feature-preview-details">
          <div><dt>Care type</dt><dd>Watering</dd></div>
          <div><dt>Target</dt><dd>Back garden · Tomato group</dd></div>
          <div><dt>Review</dt><dd>Every extracted field remains editable before it reaches Care History.</dd></div>
        </dl>
      </>,
    };
  }

  if (feature === "plant-health") {
    return {
      heading: "Plant Doctor runs in the local app",
      description: "The local workflow keeps photos and written observations together, then presents a cautious assessment for review.",
      sampleTitle: "Leaf observation",
      body: <>
        <p className="feature-preview-label">Observation</p>
        <p>White powdery spots on the zucchini leaves.</p>
        <dl className="feature-preview-details">
          <div><dt>Possible issue</dt><dd>Powdery mildew</dd></div>
          <div><dt>Suggested next step</dt><dd>Check leaf surfaces, airflow, and recent humidity before taking action.</dd></div>
          <div><dt>Confidence</dt><dd>Medium</dd></div>
        </dl>
      </>,
    };
  }

  return {
    heading: "Plant Guide runs in the local app",
    description: "The local retrieval workflow searches reviewed source cards and shows the evidence used for a bilingual answer.",
    sampleTitle: "Cited garden question",
    body: <>
      <p className="feature-preview-label">Question</p>
      <p>My zucchini leaves have a lot of white powder on them — is it diseased?</p>
      <p className="feature-preview-label">Answer</p>
      <p>White powdery residue is likely powdery mildew. Check both sides of the leaves for yellowing or curling, and review recent watering and humidity, before deciding on treatment.</p>
      <p className="feature-preview-source">Sample source: University of Minnesota Extension · Growing summer squash and zucchini in home gardens</p>
    </>,
  };
}
