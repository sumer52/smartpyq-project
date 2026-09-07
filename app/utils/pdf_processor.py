"""PDF processing utilities for Smart PYQ application.

Provides functionality for:
- Text extraction from PDFs
- OCR for scanned documents
- Thumbnail generation
- Metadata extraction
- PDF validation
"""

import logging
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from PIL import Image, ImageDraw, ImageFont
import io

logger = logging.getLogger(__name__)

class PDFProcessor:
    """PDF processing utility class."""
    
    def __init__(self):
        """Initialize PDF processor with required libraries."""
        self.max_file_size = 100 * 1024 * 1024  # 100MB
        self.max_pages = 500
        self.thumbnail_size = (300, 400)
        
        # Check for required libraries
        self._check_dependencies()
        
        logger.info("PDF processor initialized")
    
    def _check_dependencies(self) -> None:
        """Check if required libraries are available."""
        try:
            import PyPDF2
            import fitz  # PyMuPDF
            self.has_pymupdf = True
        except ImportError:
            logger.warning("PyMuPDF not available, falling back to PyPDF2 only")
            self.has_pymupdf = False
        
        try:
            import pytesseract
            self.has_ocr = True
            logger.info("OCR capabilities available")
        except ImportError:
            logger.warning("Tesseract not available, OCR disabled")
            self.has_ocr = False
    
    def validate_pdf(self, file_path: str) -> Dict[str, Any]:
        """Validate PDF file.
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Dict with validation results
        """
        try:
            file_path_obj = Path(file_path)
            
            # Check file exists
            if not file_path_obj.exists():
                return {"valid": False, "error": "File does not exist"}
            
            # Check file size
            file_size = file_path_obj.stat().st_size
            if file_size > self.max_file_size:
                return {
                    "valid": False,
                    "error": f"File too large: {file_size / (1024*1024):.1f}MB (max: {self.max_file_size / (1024*1024)}MB)"
                }
            
            # Check if it's a valid PDF
            try:
                if self.has_pymupdf:
                    import fitz
                    doc = fitz.open(file_path)
                    page_count = len(doc)
                    doc.close()
                else:
                    import PyPDF2
                    with open(file_path, 'rb') as file:
                        reader = PyPDF2.PdfReader(file)
                        page_count = len(reader.pages)
                
                # Check page count
                if page_count > self.max_pages:
                    return {
                        "valid": False,
                        "error": f"Too many pages: {page_count} (max: {self.max_pages})"
                    }
                
                return {
                    "valid": True,
                    "file_size": file_size,
                    "page_count": page_count
                }
                
            except Exception as e:
                return {"valid": False, "error": f"Invalid PDF file: {str(e)}"}
                
        except Exception as e:
            logger.error(f"Error validating PDF {file_path}: {str(e)}")
            return {"valid": False, "error": f"Validation error: {str(e)}"}
    
    def extract_text_and_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract text and metadata from PDF.
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Dict with extracted text and metadata
        """
        start_time = time.time()
        
        try:
            # Validate PDF first
            validation = self.validate_pdf(file_path)
            if not validation["valid"]:
                raise ValueError(validation["error"])
            
            result = {
                "text": "",
                "page_count": validation["page_count"],
                "file_size": validation["file_size"],
                "has_images": False,
                "metadata": {},
                "processing_time": 0,
                "extraction_method": "unknown"
            }
            
            # Try PyMuPDF first (better performance and features)
            if self.has_pymupdf:
                result.update(self._extract_with_pymupdf(file_path))
            else:
                result.update(self._extract_with_pypdf2(file_path))
            
            # If text extraction failed or returned very little text, try OCR
            if len(result["text"].strip()) < 100 and self.has_ocr:
                logger.info(f"Text extraction yielded little content, trying OCR for {file_path}")
                ocr_result = self._extract_with_ocr(file_path)
                if len(ocr_result["text"]) > len(result["text"]):
                    result["text"] = ocr_result["text"]
                    result["extraction_method"] = "ocr"
            
            result["processing_time"] = time.time() - start_time
            
            logger.info(
                f"Extracted {len(result['text'])} characters from {result['page_count']} pages "
                f"in {result['processing_time']:.2f}s using {result['extraction_method']}"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error extracting text from PDF {file_path}: {str(e)}")
            raise
    
    def _extract_with_pymupdf(self, file_path: str) -> Dict[str, Any]:
        """Extract text using PyMuPDF."""
        import fitz
        
        text_content = []
        has_images = False
        metadata = {}
        
        try:
            doc = fitz.open(file_path)
            
            # Extract metadata
            metadata = {
                "title": doc.metadata.get("title", ""),
                "author": doc.metadata.get("author", ""),
                "subject": doc.metadata.get("subject", ""),
                "creator": doc.metadata.get("creator", ""),
                "producer": doc.metadata.get("producer", ""),
                "creation_date": doc.metadata.get("creationDate", ""),
                "modification_date": doc.metadata.get("modDate", "")
            }
            
            # Extract text from each page
            for page_num in range(len(doc)):
                page = doc[page_num]
                
                # Extract text
                page_text = page.get_text()
                if page_text.strip():
                    text_content.append(f"\n--- Page {page_num + 1} ---\n")
                    text_content.append(page_text)
                
                # Check for images
                if not has_images:
                    image_list = page.get_images()
                    if image_list:
                        has_images = True
            
            doc.close()
            
            return {
                "text": "\n".join(text_content),
                "has_images": has_images,
                "metadata": metadata,
                "extraction_method": "pymupdf"
            }
            
        except Exception as e:
            logger.error(f"PyMuPDF extraction failed: {str(e)}")
            raise
    
    def _extract_with_pypdf2(self, file_path: str) -> Dict[str, Any]:
        """Extract text using PyPDF2."""
        import PyPDF2
        
        text_content = []
        metadata = {}
        
        try:
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                
                # Extract metadata
                if reader.metadata:
                    metadata = {
                        "title": reader.metadata.get("/Title", ""),
                        "author": reader.metadata.get("/Author", ""),
                        "subject": reader.metadata.get("/Subject", ""),
                        "creator": reader.metadata.get("/Creator", ""),
                        "producer": reader.metadata.get("/Producer", ""),
                        "creation_date": str(reader.metadata.get("/CreationDate", "")),
                        "modification_date": str(reader.metadata.get("/ModDate", ""))
                    }
                
                # Extract text from each page
                for page_num, page in enumerate(reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text.strip():
                            text_content.append(f"\n--- Page {page_num + 1} ---\n")
                            text_content.append(page_text)
                    except Exception as e:
                        logger.warning(f"Failed to extract text from page {page_num + 1}: {str(e)}")
                        continue
            
            return {
                "text": "\n".join(text_content),
                "has_images": False,  # PyPDF2 doesn't easily detect images
                "metadata": metadata,
                "extraction_method": "pypdf2"
            }
            
        except Exception as e:
            logger.error(f"PyPDF2 extraction failed: {str(e)}")
            raise
    
    def _extract_with_ocr(self, file_path: str) -> Dict[str, Any]:
        """Extract text using OCR (Tesseract)."""
        if not self.has_ocr:
            return {"text": "", "extraction_method": "ocr_unavailable"}
        
        try:
            import fitz
            import pytesseract
            from PIL import Image
            
            text_content = []
            
            doc = fitz.open(file_path)
            
            # Process first few pages only (OCR is slow)
            max_ocr_pages = min(10, len(doc))
            
            for page_num in range(max_ocr_pages):
                page = doc[page_num]
                
                # Convert page to image
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
                img_data = pix.tobytes("ppm")
                
                # Convert to PIL Image
                img = Image.open(io.BytesIO(img_data))
                
                # Perform OCR
                try:
                    page_text = pytesseract.image_to_string(img, lang='eng')
                    if page_text.strip():
                        text_content.append(f"\n--- Page {page_num + 1} (OCR) ---\n")
                        text_content.append(page_text)
                except Exception as e:
                    logger.warning(f"OCR failed for page {page_num + 1}: {str(e)}")
                    continue
            
            doc.close()
            
            return {
                "text": "\n".join(text_content),
                "extraction_method": "ocr"
            }
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {str(e)}")
            return {"text": "", "extraction_method": "ocr_failed"}
    
    def generate_thumbnail(self, file_path: str, output_path: Optional[str] = None) -> Optional[str]:
        """Generate thumbnail image from PDF first page.
        
        Args:
            file_path: Path to PDF file
            output_path: Optional output path for thumbnail
            
        Returns:
            Path to generated thumbnail or None if failed
        """
        try:
            if not output_path:
                output_path = str(Path(tempfile.gettempdir()) / f"thumb_{Path(file_path).stem}.jpg")
            
            if self.has_pymupdf:
                return self._generate_thumbnail_pymupdf(file_path, output_path)
            else:
                return self._generate_thumbnail_fallback(file_path, output_path)
                
        except Exception as e:
            logger.error(f"Failed to generate thumbnail for {file_path}: {str(e)}")
            return None
    
    def _generate_thumbnail_pymupdf(self, file_path: str, output_path: str) -> str:
        """Generate thumbnail using PyMuPDF."""
        import fitz
        
        doc = fitz.open(file_path)
        
        if len(doc) == 0:
            raise ValueError("PDF has no pages")
        
        # Get first page
        page = doc[0]
        
        # Create pixmap (image) from page
        # Use matrix to control resolution
        mat = fitz.Matrix(2, 2)  # 2x zoom for better quality
        pix = page.get_pixmap(matrix=mat)
        
        # Convert to PIL Image
        img_data = pix.tobytes("ppm")
        img = Image.open(io.BytesIO(img_data))
        
        # Resize to thumbnail size while maintaining aspect ratio
        img.thumbnail(self.thumbnail_size, Image.Resampling.LANCZOS)
        
        # Create a white background image
        thumb = Image.new('RGB', self.thumbnail_size, 'white')
        
        # Center the resized image on the white background
        x = (self.thumbnail_size[0] - img.width) // 2
        y = (self.thumbnail_size[1] - img.height) // 2
        thumb.paste(img, (x, y))
        
        # Save thumbnail
        thumb.save(output_path, 'JPEG', quality=85, optimize=True)
        
        doc.close()
        
        logger.info(f"Generated thumbnail: {output_path}")
        return output_path
    
    def _generate_thumbnail_fallback(self, file_path: str, output_path: str) -> str:
        """Generate a simple text-based thumbnail when PyMuPDF is not available."""
        # Create a simple thumbnail with PDF info
        img = Image.new('RGB', self.thumbnail_size, 'white')
        draw = ImageDraw.Draw(img)
        
        try:
            # Try to load a font
            font = ImageFont.truetype("arial.ttf", 16)
        except:
            font = ImageFont.load_default()
        
        # Draw PDF icon and text
        text_lines = [
            "PDF Document",
            "",
            Path(file_path).stem[:20],
            "",
            "Preview not available"
        ]
        
        y_offset = 50
        for line in text_lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            text_width = bbox[2] - bbox[0]
            x = (self.thumbnail_size[0] - text_width) // 2
            draw.text((x, y_offset), line, fill='black', font=font)
            y_offset += 30
        
        # Draw a simple PDF icon
        draw.rectangle([50, 20, 250, 40], outline='red', width=2)
        draw.text((55, 25), "PDF", fill='red', font=font)
        
        img.save(output_path, 'JPEG', quality=85)
        
        logger.info(f"Generated fallback thumbnail: {output_path}")
        return output_path
    
    def add_watermark(self, file_path: str, watermark_text: str, output_path: Optional[str] = None) -> str:
        """Add watermark to PDF.
        
        Args:
            file_path: Path to input PDF
            watermark_text: Text to use as watermark
            output_path: Optional output path
            
        Returns:
            Path to watermarked PDF
        """
        if not output_path:
            output_path = str(Path(tempfile.gettempdir()) / f"watermarked_{Path(file_path).name}")
        
        try:
            if self.has_pymupdf:
                return self._add_watermark_pymupdf(file_path, watermark_text, output_path)
            else:
                # For now, just copy the file if PyMuPDF is not available
                import shutil
                shutil.copy2(file_path, output_path)
                logger.warning("Watermarking requires PyMuPDF, file copied without watermark")
                return output_path
                
        except Exception as e:
            logger.error(f"Failed to add watermark to {file_path}: {str(e)}")
            raise
    
    def _add_watermark_pymupdf(self, file_path: str, watermark_text: str, output_path: str) -> str:
        """Add watermark using PyMuPDF."""
        import fitz
        
        doc = fitz.open(file_path)
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # Get page dimensions
            rect = page.rect
            
            # Create watermark text
            text_rect = fitz.Rect(50, rect.height - 50, rect.width - 50, rect.height - 20)
            
            # Add watermark text
            page.insert_textbox(
                text_rect,
                watermark_text,
                fontsize=10,
                color=(0.7, 0.7, 0.7),  # Light gray
                align=fitz.TEXT_ALIGN_CENTER
            )
        
        # Save watermarked PDF
        doc.save(output_path)
        doc.close()
        
        logger.info(f"Added watermark to PDF: {output_path}")
        return output_path
    
    def get_pdf_info(self, file_path: str) -> Dict[str, Any]:
        """Get comprehensive PDF information.
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Dict with PDF information
        """
        try:
            validation = self.validate_pdf(file_path)
            if not validation["valid"]:
                return {"error": validation["error"]}
            
            info = {
                "file_path": file_path,
                "file_name": Path(file_path).name,
                "file_size": validation["file_size"],
                "page_count": validation["page_count"],
                "valid": True
            }
            
            # Try to get additional metadata
            if self.has_pymupdf:
                import fitz
                doc = fitz.open(file_path)
                info["metadata"] = doc.metadata
                doc.close()
            
            return info
            
        except Exception as e:
            logger.error(f"Error getting PDF info for {file_path}: {str(e)}")
            return {"error": str(e), "valid": False}