import json
import random

from iwnlp.iwnlp_wrapper import IWNLPWrapper


lemmatizer = IWNLPWrapper(
    lemmatizer_path="data/iwnlp/IWNLP.Lemmatizer_20181001.json"
)

with open("data/crossword/crossword-bank-raw.json", "r", encoding="utf-8") as file:
    entries = json.load(file)


POS_MAP = {
    "noun": "NOUN",
    "adjective": "ADJ",
    "verb": "VERB",
    "adverb": "ADV",
}


base_forms = []
inflected = []
unknown = []
unsupported_pos = []


for entry in entries:
    word = entry["word"]
    pos = entry.get("pos")

    iwnlp_pos = POS_MAP.get(pos)

    if iwnlp_pos is None:
        unsupported_pos.append(entry)
        continue

    lemmas = lemmatizer.lemmatize(
        word,
        pos_universal_google=iwnlp_pos
    )

    if not lemmas:
        unknown.append(entry)
        continue

    normalized_word = word.casefold()
    normalized_lemmas = {
        lemma.casefold()
        for lemma in lemmas
    }

    if normalized_word in normalized_lemmas:
        base_forms.append(entry)
    else:
        inflected.append({
            "word": word,
            "pos": pos,
            "lemmas": lemmas,
        })


def print_samples(title, items, count=20):
    print(f"\n--- {title} ---")

    if not items:
        print("Keine")
        return

    for item in random.sample(items, min(count, len(items))):
        if "lemmas" in item:
            print(
                f"{item['word']} ({item['pos']})"
                f" -> {', '.join(item['lemmas'])}"
            )
        else:
            print(
                f"{item['word']} ({item.get('pos')})"
            )


print("\n==============================")
print(" CROSSWORD QUALITY REPORT")
print("==============================")

print(f"Ausgangspool:        {len(entries)}")
print(f"Grundformen:         {len(base_forms)}")
print(f"Flektiert entfernt:  {len(inflected)}")
print(f"IWNLP unbekannt:     {len(unknown)}")
print(f"POS nicht unterstützt: {len(unsupported_pos)}")

recognized = len(base_forms) + len(inflected)

if entries:
    print(
        f"IWNLP erkannt:       "
        f"{recognized / len(entries) * 100:.1f}%"
    )

print_samples("GRUNDFORMEN", base_forms)
print_samples("FLEKTIERT", inflected)
print_samples("UNBEKANNT", unknown)
print_samples("POS NICHT UNTERSTÜTZT", unsupported_pos)

candidates = []

for entry in base_forms:
    candidates.append({
        **entry,
        "lexicalStatus": "base_form",
    })

for entry in unknown:
    candidates.append({
        **entry,
        "lexicalStatus": "unknown",
    })

for entry in unsupported_pos:
    candidates.append({
        **entry,
        "lexicalStatus": "unsupported_pos",
    })

with open(
    "data/crossword/crossword-bank-candidates.json",
    "w",
    encoding="utf-8"
) as file:
    json.dump(
        candidates,
        file,
        ensure_ascii=False,
        indent=2
    )

print(
    f"\nKandidatenbank gespeichert: "
    f"{len(candidates)} Einträge"
)


print("\n==============================")
print(" 100 ZUFÄLLIGE KANDIDATEN")
print("==============================")

