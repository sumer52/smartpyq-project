"""Storage adapter for Smart PYQ file management.

Provides unified interface for different storage backends:
- Firebase Storage
- AWS S3
- Local filesystem (for development)
"""

import logging
import mimetypes
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, BinaryIO
from urllib.parse import urlparse

from ..core.config import settings

logger = logging.getLogger(__name__)

class BaseStorageBackend(ABC):
    """Abstract base class for storage backends."""
    
    @abstractmethod
    def upload_file(self, file_path: str, key: str, content_type: Optional[str] = None) -> str:
        """Upload file and return public URL."""
        pass
    
    @abstractmethod
    def upload_fileobj(self, file_obj: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
        """Upload file object and return public URL."""
        pass
    
    @abstractmethod
    def delete_file(self, key: str) -> bool:
        """Delete file by key."""
        pass
    
    @abstractmethod
    def generate_signed_url(self, key: str, expiration: int = 3600) -> str:
        """Generate signed URL for private file access."""
        pass
    
    @abstractmethod
    def file_exists(self, key: str) -> bool:
        """Check if file exists."""
        pass
    
    @abstractmethod
    def get_file_metadata(self, key: str) -> Dict[str, Any]:
        """Get file metadata."""
        pass

class FirebaseStorageBackend(BaseStorageBackend):
    """Firebase Storage backend implementation."""
    
    def __init__(self):
        try:
            import firebase_admin
            from firebase_admin import credentials, storage
            
            # Initialize Firebase Admin SDK
            if not firebase_admin._apps:
                if settings.FIREBASE_CREDENTIALS_PATH:
                    cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
                else:
                    # Use default credentials in production
                    cred = credentials.ApplicationDefault()
                
                firebase_admin.initialize_app(cred, {
                    'storageBucket': settings.FIREBASE_BUCKET
                })
            
            self.bucket = storage.bucket()
            logger.info("Firebase Storage backend initialized")
            
        except ImportError:
            raise ImportError("firebase-admin package is required for Firebase Storage")
        except Exception as e:
            logger.error(f"Failed to initialize Firebase Storage: {str(e)}")
            raise
    
    def upload_file(self, file_path: str, key: str, content_type: Optional[str] = None) -> str:
        """Upload file to Firebase Storage."""
        try:
            blob = self.bucket.blob(key)
            
            # Detect content type if not provided
            if not content_type:
                content_type, _ = mimetypes.guess_type(file_path)
                content_type = content_type or 'application/octet-stream'
            
            # Upload file
            blob.upload_from_filename(file_path, content_type=content_type)
            
            # Make blob publicly readable
            blob.make_public()
            
            logger.info(f"File uploaded to Firebase Storage: {key}")
            return blob.public_url
            
        except Exception as e:
            logger.error(f"Failed to upload file to Firebase Storage: {str(e)}")
            raise
    
    def upload_fileobj(self, file_obj: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
        """Upload file object to Firebase Storage."""
        try:
            blob = self.bucket.blob(key)
            
            content_type = content_type or 'application/octet-stream'
            
            # Upload file object
            blob.upload_from_file(file_obj, content_type=content_type)
            
            # Make blob publicly readable
            blob.make_public()
            
            logger.info(f"File object uploaded to Firebase Storage: {key}")
            return blob.public_url
            
        except Exception as e:
            logger.error(f"Failed to upload file object to Firebase Storage: {str(e)}")
            raise
    
    def delete_file(self, key: str) -> bool:
        """Delete file from Firebase Storage."""
        try:
            blob = self.bucket.blob(key)
            blob.delete()
            logger.info(f"File deleted from Firebase Storage: {key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete file from Firebase Storage: {str(e)}")
            return False
    
    def generate_signed_url(self, key: str, expiration: int = 3600) -> str:
        """Generate signed URL for Firebase Storage."""
        try:
            blob = self.bucket.blob(key)
            
            # Generate signed URL
            url = blob.generate_signed_url(
                expiration=datetime.utcnow() + timedelta(seconds=expiration),
                method='GET'
            )
            
            return url
            
        except Exception as e:
            logger.error(f"Failed to generate signed URL for Firebase Storage: {str(e)}")
            raise
    
    def file_exists(self, key: str) -> bool:
        """Check if file exists in Firebase Storage."""
        try:
            blob = self.bucket.blob(key)
            return blob.exists()
            
        except Exception as e:
            logger.error(f"Failed to check file existence in Firebase Storage: {str(e)}")
            return False
    
    def get_file_metadata(self, key: str) -> Dict[str, Any]:
        """Get file metadata from Firebase Storage."""
        try:
            blob = self.bucket.blob(key)
            blob.reload()
            
            return {
                'name': blob.name,
                'size': blob.size,
                'content_type': blob.content_type,
                'created': blob.time_created,
                'updated': blob.updated,
                'md5_hash': blob.md5_hash,
                'etag': blob.etag
            }
            
        except Exception as e:
            logger.error(f"Failed to get file metadata from Firebase Storage: {str(e)}")
            raise

class S3StorageBackend(BaseStorageBackend):
    """AWS S3 storage backend implementation."""
    
    def __init__(self):
        try:
            import boto3
            from botocore.exceptions import ClientError
            
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_REGION
            )
            
            self.bucket_name = settings.AWS_S3_BUCKET
            self.ClientError = ClientError
            
            logger.info("S3 Storage backend initialized")
            
        except ImportError:
            raise ImportError("boto3 package is required for S3 Storage")
        except Exception as e:
            logger.error(f"Failed to initialize S3 Storage: {str(e)}")
            raise
    
    def upload_file(self, file_path: str, key: str, content_type: Optional[str] = None) -> str:
        """Upload file to S3."""
        try:
            # Detect content type if not provided
            if not content_type:
                content_type, _ = mimetypes.guess_type(file_path)
                content_type = content_type or 'application/octet-stream'
            
            # Upload file
            self.s3_client.upload_file(
                file_path,
                self.bucket_name,
                key,
                ExtraArgs={
                    'ContentType': content_type,
                    'ACL': 'public-read'
                }
            )
            
            # Generate public URL
            url = f"https://{self.bucket_name}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
            
            logger.info(f"File uploaded to S3: {key}")
            return url
            
        except Exception as e:
            logger.error(f"Failed to upload file to S3: {str(e)}")
            raise
    
    def upload_fileobj(self, file_obj: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
        """Upload file object to S3."""
        try:
            content_type = content_type or 'application/octet-stream'
            
            # Upload file object
            self.s3_client.upload_fileobj(
                file_obj,
                self.bucket_name,
                key,
                ExtraArgs={
                    'ContentType': content_type,
                    'ACL': 'public-read'
                }
            )
            
            # Generate public URL
            url = f"https://{self.bucket_name}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
            
            logger.info(f"File object uploaded to S3: {key}")
            return url
            
        except Exception as e:
            logger.error(f"Failed to upload file object to S3: {str(e)}")
            raise
    
    def delete_file(self, key: str) -> bool:
        """Delete file from S3."""
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
            logger.info(f"File deleted from S3: {key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete file from S3: {str(e)}")
            return False
    
    def generate_signed_url(self, key: str, expiration: int = 3600) -> str:
        """Generate signed URL for S3."""
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': key},
                ExpiresIn=expiration
            )
            
            return url
            
        except Exception as e:
            logger.error(f"Failed to generate signed URL for S3: {str(e)}")
            raise
    
    def file_exists(self, key: str) -> bool:
        """Check if file exists in S3."""
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=key)
            return True
            
        except self.ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            logger.error(f"Failed to check file existence in S3: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Failed to check file existence in S3: {str(e)}")
            return False
    
    def get_file_metadata(self, key: str) -> Dict[str, Any]:
        """Get file metadata from S3."""
        try:
            response = self.s3_client.head_object(Bucket=self.bucket_name, Key=key)
            
            return {
                'name': key,
                'size': response.get('ContentLength'),
                'content_type': response.get('ContentType'),
                'created': response.get('LastModified'),
                'updated': response.get('LastModified'),
                'etag': response.get('ETag', '').strip('"'),
                'metadata': response.get('Metadata', {})
            }
            
        except Exception as e:
            logger.error(f"Failed to get file metadata from S3: {str(e)}")
            raise

class LocalStorageBackend(BaseStorageBackend):
    """Local filesystem storage backend for development."""
    
    def __init__(self):
        self.base_path = Path(settings.LOCAL_STORAGE_PATH or "./storage")
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.base_url = settings.LOCAL_STORAGE_URL or "http://localhost:8080/files"
        
        logger.info(f"Local Storage backend initialized at {self.base_path}")
    
    def upload_file(self, file_path: str, key: str, content_type: Optional[str] = None) -> str:
        """Copy file to local storage."""
        try:
            dest_path = self.base_path / key
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Copy file
            import shutil
            shutil.copy2(file_path, dest_path)
            
            # Generate public URL
            url = f"{self.base_url}/{key}"
            
            logger.info(f"File copied to local storage: {key}")
            return url
            
        except Exception as e:
            logger.error(f"Failed to copy file to local storage: {str(e)}")
            raise
    
    def upload_fileobj(self, file_obj: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
        """Save file object to local storage."""
        try:
            dest_path = self.base_path / key
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write file object
            with open(dest_path, 'wb') as f:
                file_obj.seek(0)
                f.write(file_obj.read())
            
            # Generate public URL
            url = f"{self.base_url}/{key}"
            
            logger.info(f"File object saved to local storage: {key}")
            return url
            
        except Exception as e:
            logger.error(f"Failed to save file object to local storage: {str(e)}")
            raise
    
    def delete_file(self, key: str) -> bool:
        """Delete file from local storage."""
        try:
            file_path = self.base_path / key
            if file_path.exists():
                file_path.unlink()
                logger.info(f"File deleted from local storage: {key}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Failed to delete file from local storage: {str(e)}")
            return False
    
    def generate_signed_url(self, key: str, expiration: int = 3600) -> str:
        """Generate signed URL (same as public URL for local storage)."""
        return f"{self.base_url}/{key}"
    
    def file_exists(self, key: str) -> bool:
        """Check if file exists in local storage."""
        return (self.base_path / key).exists()
    
    def get_file_metadata(self, key: str) -> Dict[str, Any]:
        """Get file metadata from local storage."""
        try:
            file_path = self.base_path / key
            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {key}")
            
            stat = file_path.stat()
            content_type, _ = mimetypes.guess_type(str(file_path))
            
            return {
                'name': key,
                'size': stat.st_size,
                'content_type': content_type or 'application/octet-stream',
                'created': datetime.fromtimestamp(stat.st_ctime),
                'updated': datetime.fromtimestamp(stat.st_mtime)
            }
            
        except Exception as e:
            logger.error(f"Failed to get file metadata from local storage: {str(e)}")
            raise

class StorageAdapter:
    """Storage adapter that provides unified interface for different backends."""
    
    def __init__(self):
        """Initialize storage adapter with configured backend."""
        backend_type = settings.STORAGE_BACKEND.lower()
        
        if backend_type == "firebase":
            self.backend = FirebaseStorageBackend()
        elif backend_type == "s3":
            self.backend = S3StorageBackend()
        elif backend_type == "local":
            self.backend = LocalStorageBackend()
        else:
            raise ValueError(f"Unsupported storage backend: {backend_type}")
        
        logger.info(f"Storage adapter initialized with {backend_type} backend")
    
    def upload_file(self, file_path: str, key: str, content_type: Optional[str] = None) -> str:
        """Upload file and return public URL."""
        return self.backend.upload_file(file_path, key, content_type)
    
    def upload_fileobj(self, file_obj: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
        """Upload file object and return public URL."""
        return self.backend.upload_fileobj(file_obj, key, content_type)
    
    def delete_file(self, key: str) -> bool:
        """Delete file by key."""
        return self.backend.delete_file(key)
    
    def generate_signed_url(self, key: str, expiration: Optional[int] = None) -> str:
        """Generate signed URL for private file access."""
        expiration = expiration or settings.SIGNED_URL_TTL_SECONDS
        return self.backend.generate_signed_url(key, expiration)
    
    def file_exists(self, key: str) -> bool:
        """Check if file exists."""
        return self.backend.file_exists(key)
    
    def get_file_metadata(self, key: str) -> Dict[str, Any]:
        """Get file metadata."""
        return self.backend.get_file_metadata(key)
    
    def get_upload_url(self, key: str, content_type: str, expiration: int = 3600) -> Dict[str, str]:
        """Get presigned URL for direct upload (S3 only)."""
        if hasattr(self.backend, 's3_client'):
            try:
                response = self.backend.s3_client.generate_presigned_post(
                    Bucket=self.backend.bucket_name,
                    Key=key,
                    Fields={'Content-Type': content_type},
                    Conditions=[
                        {'Content-Type': content_type},
                        ['content-length-range', 1, 100 * 1024 * 1024]  # 1 byte to 100MB
                    ],
                    ExpiresIn=expiration
                )
                return response
            except Exception as e:
                logger.error(f"Failed to generate presigned POST URL: {str(e)}")
                raise
        else:
            raise NotImplementedError("Direct upload URLs only supported for S3 backend")


# Alias for backward compatibility
StorageService = StorageAdapter