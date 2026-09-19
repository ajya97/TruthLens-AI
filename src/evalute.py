from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

def evaluate_model(y_pred, y_test):
    """
    Evaluates the performance of the model by calculating accuracy, confusion matrix, and classification report.

    Parameters:
    y_pred: The predicted class labels from the model.
    y_test: The true class labels for the test data.

    Returns:
    accuracy: The accuracy score of the model.
    conf_matrix: The confusion matrix showing true vs predicted labels.
    class_report: A detailed classification report including precision, recall, and F1-score.
    """
    accuracy = accuracy_score(y_test, y_pred)
    conf_matrix = confusion_matrix(y_test, y_pred)
    class_report = classification_report(y_test, y_pred)

    return accuracy, conf_matrix, class_report