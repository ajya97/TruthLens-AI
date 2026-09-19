from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression



def train_model(df):

    X_train, X_test, y_train, y_test = train_test_split(df['text'],df['label'], test_size=0.33, random_state=42)
    encoder = LabelEncoder()
    y_train = encoder.fit_transform(y_train)
    y_test = encoder.transform(y_test)
    

    vectorizer = TfidfVectorizer()
    X_train = vectorizer.fit_transform(X_train)
    X_test = vectorizer.transform(X_test)  

    model = LogisticRegression(max_iter=10000)
    model.fit(X_train,y_train)

    return model, vectorizer, X_test, y_test