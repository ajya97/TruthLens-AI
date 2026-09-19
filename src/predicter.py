from src.feature_engineering import remove_putch_stopword_number
from src.predict import predict_model


def predict_news(txt,vectorizer,model):
    txt = remove_putch_stopword_number(txt)
    txt = vectorizer.transform([txt])
    predict_value, predict_prob = predict_model(model,txt)
    values = "REAL" if predict_value == 0 else "FAKE"
    return {"prediction":values,"confidence":predict_prob.max()}    