import pandas as pd
import joblib
from src.feature_engineering import remove_putch_stopword_number
from src.train import train_model
from src.predict import predict_model
from src.evalute import evaluate_model

def train_and_evaluate(df):
    """
    Trains a machine learning model on the provided DataFrame and evaluates its performance.

    Parameters:
    df: A pandas DataFrame containing the text data and corresponding labels.

    Returns:
    model: The trained machine learning model.
    vectorizer: The TfidfVectorizer used for transforming the text data.
    encoder: The LabelEncoder used for encoding the labels.
    accuracy: The accuracy score of the model on the test data.
    conf_matrix: The confusion matrix showing true vs predicted labels.
    class_report: A detailed classification report including precision, recall, and F1-score.
    """
    # Preprocess the text data
    df['text'] = df['text'].apply(remove_putch_stopword_number)

    # Train the model
    model, vectorizer, X_test, y_test = train_model(df)

    # Make predictions
    y_pred, _ = predict_model(model, X_test)

    # Evaluate the model
    accuracy, conf_matrix, class_report = evaluate_model(y_pred, y_test)

    return model, vectorizer, accuracy, conf_matrix, class_report

def save_model(model, vectorizer):
    """
    Saves the trained model, vectorizer, and encoder to the specified file paths.

    Parameters:
    model: The trained machine learning model.
    vectorizer: The TfidfVectorizer used for transforming the text data.
    encoder: The LabelEncoder used for encoding the labels.
    model_path: The file path to save the trained model.
    vectorizer_path: The file path to save the TfidfVectorizer.
    encoder_path: The file path to save the LabelEncoder.
    """
    joblib.dump(model, "models/model.pkl")
    joblib.dump(vectorizer, "models/vectorizer.pkl")

def save_report(accuracy, conf_matrix, class_report):
    """
    Saves the evaluation report to a text file.

    Parameters:
    accuracy: The accuracy score of the model.
    conf_matrix: The confusion matrix showing true vs predicted labels.
    class_report: A detailed classification report including precision, recall, and F1-score.
    report_path: The file path to save the evaluation report.
    """
    with open("reports/report.txt", "w") as f:
        f.write(f"Accuracy: {accuracy}\n")
        f.write(f"Confusion Matrix:\n{conf_matrix}\n")
        f.write(f"Classification Report:\n{class_report}\n")

def trainer():
    # Load the dataset
    df = pd.read_csv("dataset/dataset.csv")
    df1 = pd.DataFrame({'text':df['Real News'],"label":"REAL"})
    df2 = pd.DataFrame({'text':df['Fake News'],"label":"FAKE"})
    df3 = pd.DataFrame({'text':df['AI-generated Fake News'],"label":"FAKE"})

    df = pd.concat([df1,df2,df3],ignore_index=True,)

    # Train and evaluate the model
    model, vectorizer, accuracy, conf_matrix, class_report = train_and_evaluate(df)

    # Save the trained model and vectorizer
    save_model(model, vectorizer)

    # Save the evaluation report
    save_report(accuracy, conf_matrix, class_report)
    return accuracy



    