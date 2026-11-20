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


# --- ADR-0085 N8: what the first paid run (batch 4) showed. Offline fakes only. ---


def test_empty_padding_events_and_a_long_date_hint_do_not_spoil_the_answer():
    note = "今天给前院浇了水"
    raw = {"overflow": False, "sharedDateText": note * 6, "events": [event(note, gardenName="前院", targetScope="garden"), {**event(""), "kind": "unrelated"}]}
    parsed = batch.parse_batch(__import__("json").dumps(raw, ensure_ascii=False))
    assert len(parsed.events) == 1 and parsed.shared_date_text is None


def test_a_rewritten_quote_takes_the_clause_of_the_note_that_names_its_targets():
    note = "今天给前院浇了水，fertilized the 后院 Kale with 5 ml fish emulsion"
    result = drafts(note, event("今天给前院浇了水", gardenName="前院", targetScope="garden"),
                    event("I fertilized the 后院 Kale with 5 ml fish emulsion", type="fertilizing", gardenName="后院", targetScope="plant-group",
                          targetName="Kale", fertilizerProduct="fish emulsion", fertilizerAmount=5, fertilizerUnit="ml"))
    row = result["drafts"][1]
    assert row["sourceText"] == "fertilized the 后院 Kale with 5 ml fish emulsion"
    assert (row["plantingRecordId"], row["fertilizerAmount"], row["date"]) == ("back-kale", 5, "2026-11-11")
    assert result["notices"] == []


def test_a_quote_that_matches_no_single_clause_drafts_nothing_and_says_so():
    note = "今天给前院浇了水，给后院浇了水"
    result = drafts(note, event("给前院和后院都浇了水", gardenName="社区花园", targetScope="garden"))
    assert result["drafts"] == []
    assert result["notices"][0]["message"] == batch.UNMATCHED_MESSAGE


def test_a_quote_too_narrow_for_its_names_widens_to_its_sentence():
    note = "今天发现前院的番茄有蚜虫，用肥皂水喷了一遍"
    row = drafts(note, event("用肥皂水喷了一遍", type="pest-treatment", gardenName="前院", targetScope="plant-group", targetName="番茄",
                             pestProblem="蚜虫", pestTreatment="肥皂水"))["drafts"][0]
    assert row["sourceText"] == note and row["plantingRecordId"] == "front-tomato" and row["pestProblem"] == "蚜虫"


def test_one_copy_per_garden_of_an_unnamed_event_collapses_into_one():
    note = "今天所有花园都浇了水"
    rows = drafts(note, *[event(note, gardenName=name, targetScope="all-gardens") for name in ("前院", "后院", "社区花园")])["drafts"]
    assert [(row["gardenId"], row["targetScope"]) for row in rows] == [(None, "all-gardens")]
    note = "Today I watered Kale"
    rows = drafts(note, *[event(note, gardenName=name, targetScope="plant-group", targetName="Kale") for name in ("前院", "后院")])["drafts"]
    assert [(row["gardenId"], row["plantingRecordId"]) for row in rows] == [("back", "back-kale")]


def test_names_the_quote_does_not_state_are_ignored_not_trusted():
    row = drafts("Today I watered Kale", event("Today I watered Kale", gardenName="前院", targetScope="plant-group", targetName="Kale"))["drafts"][0]
    assert (row["gardenId"], row["plantingRecordId"]) == ("back", "back-kale")
    row = drafts("今天给前院浇了水", event("今天给前院浇了水", gardenName="前院", targetScope="garden", targetName="高床"))["drafts"][0]
    assert (row["gardenId"], row["targetScope"]) == ("front", "garden")
    row = drafts("今天给前院浇了水", event("今天给前院浇了水", gardenName="前院", targetScope="garden", targetName="前院"))["drafts"][0]
    assert row["targetScope"] == "garden"


def test_a_named_bed_or_plant_labelled_garden_becomes_that_target():
    row = drafts("今天给后院的 Kale 浇了水", event("今天给后院的 Kale 浇了水", gardenName="后院", targetScope="garden", targetName="Kale"))["drafts"][0]
    assert (row["targetScope"], row["plantingRecordId"]) == ("plant-group", "back-kale")
    # 高床 names an area in 后院, so the label becomes planting-area; a name that is both an area and a plant would stay unresolved.
    row = drafts("今天给后院的高床浇了水", event("今天给后院的高床浇了水", gardenName="后院", targetScope="garden", targetName="高床"))["drafts"][0]
    assert (row["targetScope"], row["growingAreaId"]) == ("planting-area", "back-bed")


@pytest.mark.parametrize("note, reason", [("今天在后院摘了 Kale", "unsupported"), ("Picked Kale in 后院 today", "unsupported"), ("今天在后院弄了 Kale", "ambiguous")])
def test_planting_needs_a_planting_word(note, reason):
    result = drafts(note, event(note, type="planting", gardenName="后院", targetScope="plant-group", targetName="Kale", plantName="Kale"))
    assert result["drafts"] == [] and result["notices"][0]["reason"] == reason
    assert drafts("今天在后院种了 Kale", event("今天在后院种了 Kale", type="planting", gardenName="后院", targetScope="garden"))["drafts"]


@pytest.mark.parametrize("note, source, expected", [
    ("Today: watered 前院; fertilized 后院", "fertilized 后院", "2026-11-11"),
    ("昨天给前院浇了水，给后院施了肥", "给后院施了肥", "2026-11-10"),
    # A date word the rules cannot read anywhere in the note keeps every undated fragment empty.
    ("今天给前院浇了水，11月9日给后院施了肥", "给后院施了肥", None),
    ("上周三给后院施了肥，今天给前院浇了水", "给后院施了肥", None),
    ("今天给前院浇了水，昨天给后院施了肥", "给后院施了肥", None),
])
def test_an_undated_fragment_takes_the_notes_one_date(note, source, expected):
    rows = drafts(note, event(source, type="fertilizing", gardenName="后院", targetScope="garden"))["drafts"]
    assert rows[0]["date"] == expected


def test_a_planned_fragment_does_not_stop_the_done_work_taking_todays_date():
    note = "Today I watered 前院. Tomorrow I will prune 后院"
    result = drafts(note, event("I watered 前院", gardenName="前院", targetScope="garden"),
                    event("Tomorrow I will prune 后院", kind="planned", type="pruning", gardenName="后院", targetScope="garden"))
    assert result["drafts"][0]["date"] == "2026-11-11"
    assert result["notices"][0]["task"]["dueDate"] == "2026-11-12"
