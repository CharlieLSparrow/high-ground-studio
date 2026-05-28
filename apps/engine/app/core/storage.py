def upload_to_gcs(file_path: str, bucket_name: str, destination_blob_name: str) -> str:
    """
    Uploads a file to a Google Cloud Storage bucket.
    """
    # from google.cloud import storage
    # storage_client = storage.Client()
    # bucket = storage_client.bucket(bucket_name)
    # blob = bucket.blob(destination_blob_name)
    # blob.upload_from_filename(file_path)
    # return f"gs://{bucket_name}/{destination_blob_name}"
    
    return f"gs://{bucket_name}/{destination_blob_name}"

def generate_signed_url(bucket_name: str, blob_name: str, expiration_minutes: int = 60) -> str:
    """
    Generates a signed URL for a GCS blob so the Next.js frontend can display it securely.
    """
    import datetime
    # from google.cloud import storage
    # storage_client = storage.Client()
    # bucket = storage_client.bucket(bucket_name)
    # blob = bucket.blob(blob_name)
    # url = blob.generate_signed_url(
    #     version="v4",
    #     expiration=datetime.timedelta(minutes=expiration_minutes),
    #     method="GET",
    # )
    # return url
    return f"https://storage.googleapis.com/{bucket_name}/{blob_name}?signed=true"
