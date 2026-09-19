import string
import re
import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords

nltk.download('stopwords')
nltk.download('punkt')
nltk.download('punkt_tab')

def remove_putch_stopword_number(txt):
    txt = str(txt)
    txt = re.sub(r'\d+','',txt)
    txt = re.sub(r'["“”\'‘’]', '', txt)
    words = word_tokenize(txt)

    stop_words = set(stopwords.words('english'))
    clean_words = [word.lower() for word in words if word not in string.punctuation and word not in stop_words and not word.isdigit()]

    return ' '.join(clean_words)