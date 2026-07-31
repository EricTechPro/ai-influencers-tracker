from pipeline import language

T = 0.10


def test_chinese_title_with_no_declaration_reads_zh():
    assert language.detect("矽谷大神 Karpathy 筆記術！十分鐘學會", None, T) == ("zh", "derived")


def test_latin_title_with_no_declaration_reads_en():
    assert language.detect("How I Use Claude Code Every Day", None, T) == ("en", "derived")


def test_declaration_wins_over_the_title():
    assert language.detect("Claude Code Tutorial", "zh-Hant", T) == ("zh", "oracle")


def test_declaration_subtags_all_normalise_to_the_primary():
    for declared in ("zh", "zh-Hant", "zh-TW", "ZH-hans"):
        assert language.detect("anything", declared, T) == ("zh", "oracle")
    assert language.detect("anything", "en-US", T) == ("en", "oracle")


def test_an_unrecognised_declaration_carries_through_unrenamed():
    assert language.detect("Claude Code 入門", "ja", T) == ("ja", "oracle")


def test_a_title_with_nothing_to_measure_is_unread_not_en():
    assert language.detect("🔥🔥🔥", None, T) == (language.NO_LANG, "unread")
    assert language.detect("", None, T) == (language.NO_LANG, "unread")
    assert language.detect(None, None, T) == (language.NO_LANG, "unread")


def test_a_stray_cjk_character_below_the_threshold_stays_en():
    # The one ambiguous row in the corpus: a Latin title carrying a short CJK aside.
    assert language.detect(
        "Claude Code 一键切换到 DeepSeek (CC Switch) #Shorts #claudecode #deepseek "
        "full walkthrough for beginners and everyone else", None, 0.5
    ) == ("en", "derived")


def test_an_empty_declaration_falls_through_to_the_title():
    assert language.detect("矽谷大神筆記術", "", T) == ("zh", "derived")
