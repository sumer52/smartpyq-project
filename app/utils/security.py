"""Security utilities for Smart PYQ application.

Provides security functionality including:
- Virus scanning
- File validation
- Signed URL generation
- Content security checks
"""

import hashlib
import hmac
import logging
import mimetypes
import subprocess
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from urllib.parse import urlencode

from app.core.config import settings

logger = logging.getLogger(__name__)


class VirusScanner:
    """Virus scanning utility using ClamAV or Windows Defender."""
    
    def __init__(self):
        """Initialize virus scanner."""
        self.scanner_available = self._check_scanner_availability()
        self.max_scan_time = 300  # 5 minutes
        
        if self.scanner_available:
            logger.info("Virus scanner initialized successfully")
        else:
            logger.warning("No virus scanner available - files will be marked as clean")
    
    def _check_scanner_availability(self) -> bool:
        """Check if a virus scanner is available."""
        # Check for ClamAV
        try:
            result = subprocess.run(
                ['clamscan', '--version'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                logger.info("ClamAV scanner detected")
                return True
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
        
        # Check for Windows Defender (Windows only)
        try:
            result = subprocess.run(
                ['powershell', '-Command', 'Get-MpComputerStatus'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0 and 'AntivirusEnabled' in result.stdout:
                logger.info("Windows Defender detected")
                return True
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
        
        return False
    
    def scan_file(self, file_path: str) -> Dict[str, Any]:
        """Scan a file for viruses.
        
        Args:
            file_path: Path to the file to scan
            
        Returns:
            Dict containing scan results
        """
        start_time = time.time()
        
        if not self.scanner_available:
            logger.warning(f"No scanner available, marking {file_path} as clean")
            return {
                'is_clean': True,
                'scanner': 'none',
                'scan_time': time.time() - start_time,
                'threats_found': [],
                'message': 'No scanner available - file not scanned'
            }
        
        try:
            # Try ClamAV first
            result = self._scan_with_clamav(file_path)
            if result is not None:
                result['scan_time'] = time.time() - start_time
                return result
            
            # Fallback to Windows Defender
            result = self._scan_with_defender(file_path)
            if result is not None:
                result['scan_time'] = time.time() - start_time
                return result
            
            # No scanner worked
            logger.error(f"All virus scanners failed for {file_path}")
            return {
                'is_clean': False,
                'scanner': 'failed',
                'scan_time': time.time() - start_time,
                'threats_found': [],
                'message': 'Virus scan failed - file rejected for safety'
            }
            
        except Exception as e:
            logger.error(f"Virus scan error for {file_path}: {e}")
            return {
                'is_clean': False,
                'scanner': 'error',
                'scan_time': time.time() - start_time,
                'threats_found': [],
                'message': f'Scan error: {str(e)}'
            }
    
    def _scan_with_clamav(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Scan file with ClamAV."""
        try:
            result = subprocess.run(
                ['clamscan', '--no-summary', file_path],
                capture_output=True,
                text=True,
                timeout=self.max_scan_time
            )
            
            if result.returncode == 0:
                return {
                    'is_clean': True,
                    'scanner': 'clamav',
                    'threats_found': [],
                    'message': 'File is clean'
                }
            elif result.returncode == 1:
                # Virus found
                threats = self._parse_clamav_output(result.stdout)
                return {
                    'is_clean': False,
                    'scanner': 'clamav',
                    'threats_found': threats,
                    'message': f'Threats detected: {", ".join(threats)}'
                }
            else:
                logger.error(f"ClamAV scan failed with code {result.returncode}: {result.stderr}")
                return None
                
        except subprocess.TimeoutExpired:
            logger.error(f"ClamAV scan timeout for {file_path}")
            return None
        except FileNotFoundError:
            return None
    
    def _scan_with_defender(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Scan file with Windows Defender."""
        try:
            # Use PowerShell to scan with Windows Defender
            ps_command = f"Start-MpScan -ScanType CustomScan -ScanPath '{file_path}'"
            result = subprocess.run(
                ['powershell', '-Command', ps_command],
                capture_output=True,
                text=True,
                timeout=self.max_scan_time
            )
            
            if result.returncode == 0:
                return {
                    'is_clean': True,
                    'scanner': 'defender',
                    'threats_found': [],
                    'message': 'File is clean'
                }
            else:
                # Check if threats were found
                return {
                    'is_clean': False,
                    'scanner': 'defender',
                    'threats_found': ['Unknown threat'],
                    'message': 'Potential threat detected by Windows Defender'
                }
                
        except subprocess.TimeoutExpired:
            logger.error(f"Windows Defender scan timeout for {file_path}")
            return None
        except FileNotFoundError:
            return None
    
    def _parse_clamav_output(self, output: str) -> List[str]:
        """Parse ClamAV output to extract threat names."""
        threats = []
        for line in output.split('\n'):
            if 'FOUND' in line:
                # Extract threat name from line like: "file.pdf: Threat.Name FOUND"
                parts = line.split(': ')
                if len(parts) >= 2:
                    threat_part = parts[1].replace(' FOUND', '')
                    threats.append(threat_part)
        return threats


class FileValidator:
    """File validation utilities."""
    
    ALLOWED_MIME_TYPES = {
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    
    @classmethod
    def validate_file(cls, file_path: str, allowed_types: Optional[List[str]] = None) -> Dict[str, Any]:
        """Validate a file for security and format compliance.
        
        Args:
            file_path: Path to the file to validate
            allowed_types: List of allowed MIME types (optional)
            
        Returns:
            Dict containing validation results
        """
        try:
            file_path_obj = Path(file_path)
            
            # Check if file exists
            if not file_path_obj.exists():
                return {
                    'is_valid': False,
                    'errors': ['File does not exist'],
                    'file_info': {}
                }
            
            # Get file info
            file_stat = file_path_obj.stat()
            file_size = file_stat.st_size
            
            # Check file size
            if file_size > cls.MAX_FILE_SIZE:
                return {
                    'is_valid': False,
                    'errors': [f'File too large: {file_size} bytes (max: {cls.MAX_FILE_SIZE})'],
                    'file_info': {'size': file_size}
                }
            
            # Check MIME type
            mime_type, _ = mimetypes.guess_type(str(file_path_obj))
            allowed_mime_types = set(allowed_types) if allowed_types else cls.ALLOWED_MIME_TYPES
            
            if mime_type not in allowed_mime_types:
                return {
                    'is_valid': False,
                    'errors': [f'Invalid file type: {mime_type}'],
                    'file_info': {
                        'size': file_size,
                        'mime_type': mime_type
                    }
                }
            
            # Calculate file hash
            file_hash = cls._calculate_file_hash(file_path)
            
            return {
                'is_valid': True,
                'errors': [],
                'file_info': {
                    'size': file_size,
                    'mime_type': mime_type,
                    'hash': file_hash,
                    'name': file_path_obj.name
                }
            }
            
        except Exception as e:
            logger.error(f"File validation error for {file_path}: {e}")
            return {
                'is_valid': False,
                'errors': [f'Validation error: {str(e)}'],
                'file_info': {}
            }
    
    @staticmethod
    def _calculate_file_hash(file_path: str) -> str:
        """Calculate SHA-256 hash of a file."""
        hash_sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()


def generate_signed_url(resource_path: str, expires_in: int = None) -> str:
    """Generate a signed URL for secure resource access.
    
    Args:
        resource_path: Path to the resource
        expires_in: Expiration time in seconds (default from settings)
        
    Returns:
        Signed URL string
    """
    if expires_in is None:
        expires_in = settings.SIGNED_URL_TTL_SECONDS
    
    # Calculate expiration timestamp
    expires_at = int(time.time()) + expires_in
    
    # Create signature payload
    payload = f"{resource_path}:{expires_at}"
    
    # Generate HMAC signature
    signature = hmac.new(
        settings.JWT_SECRET.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # Build signed URL
    params = {
        'expires': expires_at,
        'signature': signature
    }
    
    query_string = urlencode(params)
    return f"{resource_path}?{query_string}"


def verify_signed_url(resource_path: str, expires: int, signature: str) -> bool:
    """Verify a signed URL.
    
    Args:
        resource_path: Path to the resource
        expires: Expiration timestamp
        signature: URL signature
        
    Returns:
        True if signature is valid and not expired
    """
    # Check if expired
    if int(time.time()) > expires:
        return False
    
    # Recreate signature
    payload = f"{resource_path}:{expires}"
    expected_signature = hmac.new(
        settings.JWT_SECRET.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # Compare signatures securely
    return hmac.compare_digest(signature, expected_signature)


# Global instances
virus_scanner = VirusScanner()
file_validator = FileValidator()

# Convenience functions
def scan_file_for_viruses(file_path: str) -> Dict[str, Any]:
    """Scan a file for viruses using the global scanner instance."""
    return virus_scanner.scan_file(file_path)


def validate_uploaded_file(file_path: str, allowed_types: Optional[List[str]] = None) -> Dict[str, Any]:
    """Validate an uploaded file using the global validator instance."""
    return file_validator.validate_file(file_path, allowed_types)