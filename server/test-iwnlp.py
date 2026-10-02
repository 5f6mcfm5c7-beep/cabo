from iwnlp.iwnlp_wrapper import IWNLPWrapper

lemmatizer = IWNLPWrapper(
    lemmatizer_path="data/iwnlp/IWNLP.Lemmatizer_20181001.json"
)

words = [
    ("UNFÄLLEN", "NOUN"),
    ("GETRÄNKEN", "NOUN"),
    ("WÄLDERN", "NOUN"),
    ("STÄDTEN", "NOUN"),
    ("BISCHOFS", "NOUN"),
    ("RIESIGES", "ADJ"),
    ("SCHWÄCHER", "ADJ"),
    ("RESPEKT", "NOUN"),
    ("QUALITÄT", "NOUN"),
    ("MIKROFON", "NOUN"),
    ("REAKTION", "NOUN"),
    ("ACHTERBAHN", "NOUN"),
    ("TESTAMENT", "NOUN"),
    ("SCHWELLE", "NOUN"),
]

for word, pos in words:
    lemmas = lemmatizer.lemmatize(
        word,
        pos_universal_google=pos
    )

    print(f"{word:12} ({pos:4}) -> {lemmas}")