import json
import urllib.request

MODEL = "qwen3:8b"

with open(
    "data/crossword-bank-selected.json",
    "r",
    encoding="utf-8",
) as file:
    entries = json.load(file)


def review_entry(entry):
    prompt = f"""
Du prüfst ein Paar aus Lösung und Hinweis für ein DEUTSCHES Kreuzworträtsel.

Du sollst KEINE Entscheidung wie KEEP, OPTIONAL oder REJECT treffen.

Führe stattdessen genau zwei voneinander unabhängige Prüfungen durch.

PRÜFUNG 1: BEDEUTUNG

Frage:
Passt der Hinweis sachlich zur angegebenen Lösung?

Antworte dafür mit:
YES = Hinweis beschreibt eine tatsächliche Bedeutung der Lösung korrekt.
NO = Hinweis ist sachlich falsch oder beschreibt die Lösung nicht korrekt.

WICHTIG:
- Prüfe die konkrete Aussage des Hinweises vollständig.
- Ein teilweise passender Hinweis reicht NICHT.
- Erfinde keine zusätzliche Bedeutung, damit der Hinweis passt.
- Interpretiere die Lösung zuerst als deutsches Wort.
- Wenn eine gültige deutsche Bedeutung existiert, bevorzuge diese gegenüber
  einer zufällig gleich geschriebenen englischen Bedeutung.
- Fremdwörter, Marken, Eigennamen und Abkürzungen können trotzdem einen
  sachlich korrekten Hinweis haben.

Beispiele:
MADE + "Eine Insektenlarve" → YES
MADE + "Ein geflügeltes Insekt" → NO
ALL + "Der Kosmos" → YES
BOB + "Schlitten für Wettfahrten im Eiskanal" → YES
BER + "Stadt" → NO


PRÜFUNG 2: ART DER LÖSUNG

Ordne die Lösung unabhängig vom Hinweis genau einer Kategorie zu:

NORMAL
= normales deutsches Wort oder vollständig etablierter allgemeiner Begriff.

FOREIGN
= fremdsprachiges Wort, das nicht als normales deutsches Wort behandelt
  werden sollte.

ABBREVIATION
= Abkürzung oder Initialwort.

BRAND
= Marke oder Unternehmensname.

NAME
= Personenname, Ortsname oder sonstiger Eigenname.

SLANG
= deutliche Umgangssprache oder Slang.

INVALID
= keine sinnvolle oder brauchbare Lösung.

WICHTIG:
- Die Großschreibung ist nur Kreuzworträtsel-Schreibweise.
- ALL ist das deutsche "All" und NORMAL.
- BOB kann der deutsche Schlitten sein und NORMAL.
- BUG kann der deutsche Schiffsbug sein und NORMAL.
- FIT ist im Deutschen etabliert und NORMAL.
- GAG ist im Deutschen etabliert und NORMAL.
- SEX ist im Deutschen etabliert und NORMAL.
- TOYOTA ist BRAND.
- IHK ist ABBREVIATION.
- GEIL im Sinne von "großartig" ist SLANG.
- MOM im Sinne des englischen Wortes für Mutter ist FOREIGN.
- AIR im Sinne des englischen Wortes für Luft ist FOREIGN.

Lösung: {entry["word"]}
Hinweis: {entry["clue"]}

Antworte ausschließlich als JSON in exakt dieser Struktur:
{{
  "meaning": "YES",
  "category": "NORMAL",
  "reason": "Kurze sachliche Begründung"
}}
"""

    data = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "format": "json",
        "options": {
            "temperature": 0
        }
    }).encode("utf-8")

    request = urllib.request.Request(
        "http://localhost:11434/api/generate",
        data=data,
        headers={
            "Content-Type": "application/json"
        },
    )

    with urllib.request.urlopen(request) as response:
        result = json.loads(
            response.read().decode("utf-8")
        )

    return json.loads(result["response"])


# Härtetest mit gezielt schwierigen Einträgen
test_words = [
    "MADE",
    "BER",
    "SAP",
    "HAM",
    "MOM",
    "AIR",
    "GEIL",
    "TOYOTA",
    "IHK",
    "WALD",
    "AKKU",
    "SCHWARZWALD",
]

test_entries = [
    entry
    for word in test_words
    for entry in entries
    if entry["word"] == word
]

for entry in test_entries:
    print(f"\nPrüfe: {entry['word']} → {entry['clue']}")

    try:
        review = review_entry(entry)

        meaning = review["meaning"]
        category = review["category"]

        if meaning == "NO" or category == "INVALID":
            verdict = "REJECT"
        elif category == "NORMAL":
            verdict = "KEEP"
        else:
            verdict = "OPTIONAL"

        print(
            f"{verdict} | "
            f"meaning={meaning} | "
            f"category={category} | "
            f"{review['reason']}"
        )

    except Exception as error:
        print(f"FEHLER: {error}")