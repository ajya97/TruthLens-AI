
def predict_model(model, X_test):
    """
    Predicts the class labels for the given test data using the provided model.

    Parameters:
    model: The trained machine learning model.
    X_test: The test data for which predictions are to be made.

    Returns:
    predictions: The predicted class labels for the test data.
    predictions_proba: The predicted probabilities for each class.
    """
    predictions = model.predict(X_test)
    predictions_proba = model.predict_proba(X_test)
    return predictions, predictions_proba
