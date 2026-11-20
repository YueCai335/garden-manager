"""ADR-0085 N3: five care types, their details, planned task suggestions, and questions. Offline fakes only."""
import pytest

from app import care_note_batch as batch
from tests.test_care_note_batch import TODAY, drafts, event


def only_draft(note, **fields):
    return drafts(note, event(note, **fields))["drafts"][0]


@pytest.mark.parametrize("note, fields, expected", [
    ("今天在前院种了2棵罗勒", {"type": "planting", "plantName": "罗勒", "plantCount": 2}, {"plantName": "罗勒", "plantCount": 2}),
    ("今天在前院种了两棵罗勒", {"type": "planting", "plantName": "罗勒", "plantCount": 2}, {"plantName": "罗勒", "plantCount": 2}),
    ("Planted 3 basil in 前院 today", {"type": "planting", "plantName": "basil", "plantCount": 3}, {"plantName": "basil", "plantCount": 3}),
    ("今天把前院番茄的侧枝剪了", {"type": "pruning", "pruneDetail": "侧枝"}, {"pruneDetail": "侧枝"}),
    ("今天前院羽衣甘蓝有蚜虫，用肥皂水喷了", {"type": "pest-treatment", "pestProblem": "蚜虫", "pestTreatment": "肥皂水"}, {"pestProblem": "蚜虫", "pestTreatment": "肥皂水"}),
])
def test_each_new_type_keeps_details_found_in_its_text(note, fields, expected):
    row = only_draft(note, gardenName="前院", targetScope="garden", **fields)
    assert row["type"] == fields["type"]
    assert {key: row[key] for key in expected} == expected
    assert not any("details" in note for note in row["reviewNotes"])


@pytest.mark.parametrize("note, fields, emptied", [
    # Invented or translated details are dropped, never shown as if the gardener wrote them.
    ("今天把前院番茄的侧枝剪了", {"type": "pruning", "pruneDetail": "side shoots"}, ["pruneDetail"]),
    ("今天在前院种了罗勒", {"type": "planting", "plantName": "罗勒", "plantCount": 4}, ["plantCount"]),
    ("今天在前院种了一遍罗勒", {"type": "planting", "plantCount": 1}, ["plantCount"]),
    ("今天前院有蚜虫，处理了", {"type": "pest-treatment", "pestProblem": "蚜虫", "pestTreatment": "neem oil"}, ["pestTreatment"]),
])
def test_unsupported_details_are_left_empty_with_a_review_note(note, fields, emptied):
    row = only_draft(note, gardenName="前院", targetScope="garden", **fields)
    assert all(row[key] is None for key in emptied)
    assert batch.DETAIL_REVIEW in row["reviewNotes"]


def test_details_of_another_type_are_ignored():
    row = only_draft("今天给前院浇水，用了肥皂水", gardenName="前院", targetScope="garden", type="watering", pestTreatment="肥皂水", plantName="前院")
    assert row["pestTreatment"] is None and row["plantName"] is None
    assert row["reviewNotes"] == []


def test_a_planned_job_suggests_a_task_with_what_the_note_states():
    note = "今天给前院浇水了，明天给前院番茄剪侧枝"
    result = drafts(note, event("今天给前院浇水了", gardenName="前院", targetScope="garden"),
                    event("明天给前院番茄剪侧枝", kind="planned", type="pruning", gardenName="前院", targetScope="plant-group", targetName="番茄", pruneDetail="侧枝"))
    assert len(result["drafts"]) == 1
    notice = result["notices"][0]
    assert notice["reason"] == "planned"
    assert notice["task"]["type"] == "pruning"
    assert notice["task"]["dueDate"] == "2026-11-12"
    assert notice["task"]["gardenId"] == "front" and notice["task"]["plantingRecordId"] == "front-tomato"
    assert notice["task"]["pruneDetail"] == "侧枝"


@pytest.mark.parametrize("text, model_date, expected", [
    ("后天给前院施肥", None, "2026-11-13"),
    ("Water 前院 tomorrow", "2026-11-12", "2026-11-12"),
    ("Water 前院 tomorrow", "2026-11-20", None),
    ("明天或者后天给前院施肥", None, None),
    ("2026-11-01给前院施肥", None, None),
    ("下周给前院施肥", None, None),
])
def test_a_task_due_date_needs_one_clear_day_from_today_on(text, model_date, expected):
    notice = drafts(text, event(text, kind="planned", gardenName="前院", targetScope="garden", date=model_date))["notices"][0]
    assert notice["task"]["dueDate"] == expected


def test_a_plant_question_is_its_own_notice_without_a_task():
    note = "番茄叶子发黄是怎么回事？"
    notice = drafts(note, event(note, kind="question", type=None))["notices"][0]
    assert notice["reason"] == "question"
    assert "Plant Doctor" in notice["message"]
    assert notice["task"] is None


def test_unsupported_and_negated_notices_carry_no_task():
    note = "今天收了番茄，没给前院浇水"
    result = drafts(note, event("今天收了番茄", kind="unsupported", type=None), event("没给前院浇水", kind="negated"))
    assert [item["reason"] for item in result["notices"]] == ["unsupported", "negated"]
    assert all(item["task"] is None for item in result["notices"])


def test_a_note_mixing_gardens_types_and_languages_becomes_separate_drafts():
    note = "Today watered 前院 and 后院. 社区花园 pruned 侧枝, 今天前院种了2棵罗勒"
    rows = drafts(note,
                  event("Today watered 前院 and 后院", gardenName="前院", targetScope="garden"),
                  event("Today watered 前院 and 后院", gardenName="后院", targetScope="garden"),
                  event("社区花园 pruned 侧枝", type="pruning", gardenName="社区花园", targetScope="garden", pruneDetail="侧枝"),
                  event("今天前院种了2棵罗勒", type="planting", gardenName="前院", targetScope="garden", plantName="罗勒", plantCount=2),
                  sharedDateText=None)["drafts"]
    assert [(row["gardenId"], row["type"]) for row in rows] == [("front", "watering"), ("back", "watering"), ("community", "pruning"), ("front", "planting")]
    assert rows[2]["pruneDetail"] == "侧枝" and rows[3]["plantCount"] == 2


def test_schema_offers_five_types_and_a_whole_number_plant_count():
    item = batch.batch_output_schema()["properties"]["events"]["items"]["properties"]
    assert item["type"]["anyOf"][0]["enum"] == ["watering", "fertilizing", "planting", "pruning", "pest-treatment"]
    assert item["plantCount"] == {"type": ["integer", "null"]}
    assert "question" in item["kind"]["enum"]
    assert TODAY.isoformat() == "2026-11-11"


def test_a_named_garden_wins_over_an_all_gardens_label_the_text_does_not_support():
    note = "今天给前院浇水了"
    row = drafts(note, event(note, gardenName="前院", targetScope="all-gardens"))["drafts"][0]
    assert row["gardenId"] == "front" and row["targetScope"] == "garden"
    # Without a named garden, an all-gardens label still needs explicit every-garden wording.
    assert drafts(note, event(note, targetScope="all-gardens"))["drafts"][0]["targetScope"] is None
