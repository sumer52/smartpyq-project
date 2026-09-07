"""Email service for Smart PYQ application.

Provides email functionality including:
- OTP verification emails
- Welcome emails
- Newsletter sending
- Password reset emails
- Notification emails
"""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from jinja2 import Environment, FileSystemLoader, Template

from ..core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    """Email service for sending various types of emails."""
    
    def __init__(self):
        """Initialize email service with SMTP configuration."""
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL
        self.from_name = settings.FROM_NAME
        
        # Initialize Jinja2 template environment
        template_dir = Path(__file__).parent.parent / "templates" / "email"
        template_dir.mkdir(parents=True, exist_ok=True)
        
        self.jinja_env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=True
        )
        
        # Create default templates if they don't exist
        self._create_default_templates(template_dir)
        
        logger.info("Email service initialized")
    
    def _create_default_templates(self, template_dir: Path) -> None:
        """Create default email templates if they don't exist."""
        template_methods = {
            "otp_verification.html": "_get_otp_template",
            "welcome.html": "_get_welcome_template",
            "newsletter.html": "_get_newsletter_template",
            "password_reset.html": "_get_password_reset_template",
            "paper_approved.html": "_get_paper_approved_template",
            "paper_rejected.html": "_get_paper_rejected_template",
        }
        
        for filename, method_name in template_methods.items():
            method = getattr(self, method_name, None)
            if method is None:
                logger.warning("Skipping unavailable email template: %s", filename)
                continue
            content = method()
            template_path = template_dir / filename
            if not template_path.exists():
                template_path.write_text(content, encoding='utf-8')
                logger.info(f"Created default email template: {filename}")
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        template: str,
        context: Dict[str, Any],
        attachments: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """Send email using specified template.
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            template: Template name (without .html extension)
            context: Template context variables
            attachments: List of attachment dicts with 'path' and 'name' keys
            
        Returns:
            Dict with send results
        """
        try:
            # Load and render template
            template_obj = self.jinja_env.get_template(f"{template}.html")
            html_content = template_obj.render(**context)
            
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            
            # Add HTML content
            html_part = MIMEText(html_content, 'html', 'utf-8')
            msg.attach(html_part)
            
            # Add attachments if provided
            if attachments:
                for attachment in attachments:
                    self._add_attachment(msg, attachment['path'], attachment.get('name'))
            
            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                if self.smtp_port == 587:
                    server.starttls()
                
                if self.smtp_username and self.smtp_password:
                    server.login(self.smtp_username, self.smtp_password)
                
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email}")
            
            return {
                "status": "success",
                "to_email": to_email,
                "subject": subject,
                "template": template
            }
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            raise
    
    def send_otp_email(self, to_email: str, otp: str, user_name: str = "") -> Dict[str, Any]:
        """Send OTP verification email.
        
        In dev mode (DEV_EMAIL_LOG_OTP=True), logs OTP to console
        when SMTP is not configured, so the flow still works.
        """
        # Dev fallback: log OTP to console if SMTP isn't configured
        if settings.DEV_EMAIL_LOG_OTP and (not self.smtp_username or self.smtp_username in ('your_email@gmail.com', None)):
            logger.info(f"DEV MODE: OTP for {to_email} -> {otp}")
            print(f"\n{'='*60}\nDEV MODE: OTP for {to_email}\nOTP Code: {otp}\n{'='*60}\n")
            return {"status": "dev_logged", "to_email": to_email, "otp": otp}
        
        context = {
            "otp": otp,
            "user_name": user_name or to_email.split('@')[0],
            "app_name": "Smart PYQ",
            "support_email": settings.SUPPORT_EMAIL,
            "expiry_minutes": 10
        }
        
        return self.send_email(
            to_email=to_email,
            subject="Verify your email - Smart PYQ",
            template="otp_verification",
            context=context
        )
    
    def send_welcome_email(self, to_email: str, user_name: str, tenant_name: str) -> Dict[str, Any]:
        """Send welcome email to new user."""
        context = {
            "user_name": user_name,
            "tenant_name": tenant_name,
            "app_name": "Smart PYQ",
            "login_url": f"{settings.FRONTEND_URL}/login",
            "support_email": settings.SUPPORT_EMAIL
        }
        
        return self.send_email(
            to_email=to_email,
            subject=f"Welcome to Smart PYQ - {tenant_name}",
            template="welcome",
            context=context
        )
    
    def send_password_reset_email(self, to_email: str, reset_token: str, user_name: str) -> Dict[str, Any]:
        """Send password reset email."""
        context = {
            "user_name": user_name,
            "reset_url": f"{settings.FRONTEND_URL}/reset-password?token={reset_token}",
            "app_name": "Smart PYQ",
            "support_email": settings.SUPPORT_EMAIL,
            "expiry_hours": 1
        }
        
        return self.send_email(
            to_email=to_email,
            subject="Reset your password - Smart PYQ",
            template="password_reset",
            context=context
        )
    
    def send_paper_status_email(
        self,
        to_email: str,
        user_name: str,
        paper_title: str,
        status: str,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send paper approval/rejection email."""
        template = "paper_approved" if status == "approved" else "paper_rejected"
        subject_status = "approved" if status == "approved" else "rejected"
        
        context = {
            "user_name": user_name,
            "paper_title": paper_title,
            "status": status,
            "reason": reason,
            "app_name": "Smart PYQ",
            "papers_url": f"{settings.FRONTEND_URL}/papers",
            "support_email": settings.SUPPORT_EMAIL
        }
        
        return self.send_email(
            to_email=to_email,
            subject=f"Paper {subject_status}: {paper_title}",
            template=template,
            context=context
        )
    
    def send_newsletter(
        self,
        to_email: str,
        subject: str,
        content: str,
        featured_papers: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Send newsletter email."""
        context = {
            "content": content,
            "featured_papers": featured_papers or [],
            "app_name": "Smart PYQ",
            "unsubscribe_url": f"{settings.FRONTEND_URL}/unsubscribe?email={to_email}",
            "website_url": settings.FRONTEND_URL,
            "support_email": settings.SUPPORT_EMAIL
        }
        
        return self.send_email(
            to_email=to_email,
            subject=subject,
            template="newsletter",
            context=context
        )
    
    def _add_attachment(self, msg: MIMEMultipart, file_path: str, filename: Optional[str] = None) -> None:
        """Add attachment to email message."""
        try:
            with open(file_path, "rb") as attachment:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment.read())
            
            encoders.encode_base64(part)
            
            filename = filename or Path(file_path).name
            part.add_header(
                'Content-Disposition',
                f'attachment; filename= {filename}'
            )
            
            msg.attach(part)
            
        except Exception as e:
            logger.error(f"Failed to add attachment {file_path}: {str(e)}")
            raise
    
    def _get_otp_template(self) -> str:
        """Get default OTP verification email template."""
        return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification - {{ app_name }}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f9fafb; }
        .otp-box { background: white; border: 2px solid #2563eb; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
        .otp-code { font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 4px; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{ app_name }}</h1>
            <p>Email Verification</p>
        </div>
        
        <div class="content">
            <h2>Hello {{ user_name }}!</h2>
            
            <p>Thank you for signing up with {{ app_name }}. To complete your registration, please verify your email address using the OTP code below:</p>
            
            <div class="otp-box">
                <div class="otp-code">{{ otp }}</div>
                <p><small>This code will expire in {{ expiry_minutes }} minutes</small></p>
            </div>
            
            <p>If you didn't request this verification, please ignore this email.</p>
            
            <p>Need help? Contact us at <a href="mailto:{{ support_email }}">{{ support_email }}</a></p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 {{ app_name }}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        """
        
        return template_content


# Global email service instance
email_service = EmailService()


# Standalone async functions for easy import
async def send_welcome_email(email: str, name: str = "Subscriber") -> bool:
    """Send welcome email to new newsletter subscriber.
    
    Args:
        email: Recipient email address
        name: Recipient name (optional)
        
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        result = email_service.send_welcome_email(
            to_email=email,
            user_name=name,
            tenant_name=settings.APP_NAME
        )
        return result.get("success", False)
    except Exception as e:
        logger.error(f"Failed to send welcome email to {email}: {e}")
        return False


async def send_otp_email(email: str, otp: str, name: str = "User") -> bool:
    """Send OTP verification email.
    
    Args:
        email: Recipient email address
        otp: One-time password
        name: Recipient name (optional)
        
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        result = email_service.send_otp_email(
            to_email=email,
            otp=otp,
            user_name=name
        )
        return result.get("success", False)
    except Exception as e:
        logger.error(f"Failed to send OTP email to {email}: {e}")
        return False


async def send_password_reset_email(email: str, reset_token: str, name: str = "User") -> bool:
    """Send password reset email.
    
    Args:
        email: Recipient email address
        reset_token: Password reset token
        name: Recipient name (optional)
        
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        result = email_service.send_password_reset_email(
            to_email=email,
            reset_token=reset_token,
            user_name=name
        )
        return result.get("success", False)
    except Exception as e:
        logger.error(f"Failed to send password reset email to {email}: {e}")
        return False
    
    def _get_welcome_template(self) -> str:
        """Get default welcome email template."""
        return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to {{ app_name }}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f9fafb; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .features { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .feature { margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to {{ app_name }}!</h1>
            <p>{{ tenant_name }}</p>
        </div>
        
        <div class="content">
            <h2>Hello {{ user_name }}!</h2>
            
            <p>Welcome to {{ app_name }}! We're excited to have you join the {{ tenant_name }} community.</p>
            
            <div class="features">
                <h3>What you can do:</h3>
                <div class="feature">📚 Access thousands of previous year question papers</div>
                <div class="feature">🤖 Get help from our AI-powered study assistant</div>
                <div class="feature">📤 Upload and share your own papers</div>
                <div class="feature">🔍 Search and filter papers by subject, year, and more</div>
            </div>
            
            <p style="text-align: center;">
                <a href="{{ login_url }}" class="button">Start Exploring</a>
            </p>
            
            <p>If you have any questions, feel free to reach out to us at <a href="mailto:{{ support_email }}">{{ support_email }}</a></p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 {{ app_name }}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        """
    
    def _get_newsletter_template(self) -> str:
        """Get default newsletter email template."""
        return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ app_name }} Newsletter</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f9fafb; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        .paper-card { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #2563eb; }
        .unsubscribe { font-size: 12px; color: #888; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{ app_name }} Newsletter</h1>
        </div>
        
        <div class="content">
            {{ content | safe }}
            
            {% if featured_papers %}
            <h3>📚 Featured Papers This Week</h3>
            {% for paper in featured_papers %}
            <div class="paper-card">
                <h4>{{ paper.title }}</h4>
                <p><strong>Subject:</strong> {{ paper.subject }} | <strong>Year:</strong> {{ paper.year }}</p>
                <p>{{ paper.description or 'Recently added to our collection' }}</p>
            </div>
            {% endfor %}
            {% endif %}
            
            <p>Visit <a href="{{ website_url }}">{{ app_name }}</a> to explore more papers and features!</p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 {{ app_name }}. All rights reserved.</p>
            <p class="unsubscribe">
                Don't want to receive these emails? 
                <a href="{{ unsubscribe_url }}">Unsubscribe here</a>
            </p>
        </div>
    </div>
</body>
</html>
        """
    
    def _get_password_reset_template(self) -> str:
        """Get default password reset email template."""
        return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset - {{ app_name }}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f9fafb; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .warning { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset</h1>
            <p>{{ app_name }}</p>
        </div>
        
        <div class="content">
            <h2>Hello {{ user_name }}!</h2>
            
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            
            <p style="text-align: center;">
                <a href="{{ reset_url }}" class="button">Reset Password</a>
            </p>
            
            <div class="warning">
                <p><strong>Important:</strong> This link will expire in {{ expiry_hours }} hour(s). If you didn't request this password reset, please ignore this email.</p>
            </div>
            
            <p>For security reasons, if you don't reset your password within {{ expiry_hours }} hour(s), you'll need to request a new reset link.</p>
            
            <p>Need help? Contact us at <a href="mailto:{{ support_email }}">{{ support_email }}</a></p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 {{ app_name }}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        """
    
    def _get_paper_approved_template(self) -> str:
        """Get default paper approved email template."""
        return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Paper Approved - {{ app_name }}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #059669; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f9fafb; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        .button { display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .success { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Paper Approved!</h1>
            <p>{{ app_name }}</p>
        </div>
        
        <div class="content">
            <h2>Great news, {{ user_name }}!</h2>
            
            <div class="success">
                <p><strong>Your paper has been approved and is now live!</strong></p>
                <p><strong>Paper:</strong> {{ paper_title }}</p>
            </div>
            
            <p>Thank you for contributing to our community. Your paper is now available for other students to access and benefit from.</p>
            
            <p style="text-align: center;">
                <a href="{{ papers_url }}" class="button">View Your Papers</a>
            </p>
            
            <p>Keep sharing quality content to help fellow students succeed!</p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 {{ app_name }}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        """
    
    def _get_paper_rejected_template(self) -> str:
        """Get default paper rejected email template."""
        return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Paper Review Update - {{ app_name }}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f9fafb; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .info { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Paper Review Update</h1>
            <p>{{ app_name }}</p>
        </div>
        
        <div class="content">
            <h2>Hello {{ user_name }},</h2>
            
            <p>Thank you for your submission to {{ app_name }}. After reviewing your paper, we need to make some updates before it can be published.</p>
            
            <div class="info">
                <p><strong>Paper:</strong> {{ paper_title }}</p>
                {% if reason %}
                <p><strong>Feedback:</strong> {{ reason }}</p>
                {% endif %}
            </div>
            
            <p>Please review the feedback above and feel free to resubmit your paper after making the necessary changes.</p>
            
            <p style="text-align: center;">
                <a href="{{ papers_url }}" class="button">Upload New Version</a>
            </p>
            
            <p>If you have any questions about this feedback, please don't hesitate to contact us at <a href="mailto:{{ support_email }}">{{ support_email }}</a></p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 {{ app_name }}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        """