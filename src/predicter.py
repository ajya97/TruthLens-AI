import joblib

from src.feature_engineering import remove_putch_stopword_number
from src.predict import predict_model


def predict_news(txt):
    txt = remove_putch_stopword_number(txt)
    vectorizer_model = joblib.load("models/vectorizer.pkl")
    txt = vectorizer_model.transform([txt])
    model = joblib.load("models/model.pkl")
    predict_value, predict_prob = predict_model(model,txt)
    values = "REAL" if predict_value == 0 else "FAKE"
    return {"prediction":values,"confidence":predict_prob.max()}    