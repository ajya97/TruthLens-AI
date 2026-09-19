from flask import Blueprint, render_template, request, jsonify
import joblib

from src.predicter import predict_news
from src.trainer import trainer


main = Blueprint("main", __name__)

vectorizer_model = joblib.load("models/vectorizer.pkl")
model = joblib.load("models/model.pkl")


# Home Page
@main.route("/", methods=["GET"])
def home():
    return render_template("index.html")


# Predict Fake/Real News
@main.route("/predict", methods=["POST"])
def predict():
    try:
        # Get news text from form
        news_text = request.form.get("news_text", "").strip()
    except Exception as e:
        return render_template(
                    "index.html",
                    error="Enter news text error."
                )
    if not news_text:
        return render_template(
            "index.html",
            error="Please enter some news text."
        )
    try:
        # Prediction
        result = predict_news(news_text,vectorizer_model,model)

        return render_template(
            "predict.html",
            prediction=result["prediction"],
            confidence=result["confidence"],
            news_text=news_text
        )

    except Exception as e:
        return render_template(
            "index.html",
            error=f"Prediction error: {str(e)}"
        )


#trainer
@main.route("/train", methods=["GET"])
def train():
    try:
        accuracy = trainer()
    except Exception as e:
        return jsonify({
            "status": "Training failed",
            "error": str(e)
        }), 500
    return jsonify({
        "status": "Training successful",
        "accuracy": accuracy,
        "service": "Fake News Detector"
    }), 200

# REST API
@main.route("/api/predict", methods=["POST"])
def api_predict():
    try:
        data = request.get_json()

        if not data or "news_text" not in data:
            return jsonify({
                "success": False,
                "error": "news_text is required"
            }), 400

        news_text = data["news_text"].strip()

        if not news_text:
            return jsonify({
                "success": False,
                "error": "News text cannot be empty"
            }), 400

        # Prediction
        result = predict_news(news_text,vectorizer_model,model)

        return jsonify({
            "success": True,
            "prediction": result["prediction"],
            "confidence": result["confidence"]
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# Health Check
@main.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "service": "Fake News Detector API"
    }), 200