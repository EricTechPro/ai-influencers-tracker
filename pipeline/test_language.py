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


def test_a_description_breaks_a_tie_the_title_cannot():
    # The one video in the corpus that sits between 0 and the threshold: a Chinese sentence
    # padded by a Latin product name and hashtags. Title 0.09, description 0.44.
    title = "Claude Code 一键切换到 DeepSeek (CC Switch) #Shorts #claudecode #deepseek"
    desc = "如果您想支持我的视频创作，可以考虑加入油管会员"
    assert language.detect(title, None, T) == ("en", "derived")
    assert language.detect(title, None, T, desc) == ("zh", "derived")


def test_an_all_latin_title_ignores_a_chinese_description():
    # Chinese creators put the same Chinese membership boilerplate under every upload, including
    # their genuinely English ones. A description-first rule would relabel the whole channel.
    assert language.detect("ChatGPT for Amazon", None, T,
                           "如果您想支持我的视频创作，可以考虑加入油管会员") == ("en", "derived")


def test_a_description_cannot_overturn_a_title_that_already_cleared_the_threshold():
    assert language.detect("矽谷大神筆記術", None, T, "an english description") == ("zh", "derived")
