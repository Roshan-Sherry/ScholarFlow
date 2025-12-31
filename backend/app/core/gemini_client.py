"""Google Gemini AI client singleton for text and vision models"""

import google.generativeai as genai
from google.generativeai.types import GenerateContentResponse
from typing import AsyncIterator, Optional
import base64
from pathlib import Path
from .config import settings


class GeminiClient:
    """Singleton client for Google Gemini API"""
    
    _instance: Optional['GeminiClient'] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Initialize Gemini API with API key"""
        genai.configure(api_key=settings.google_api_key)
        
        # Configure models
        self.text_model = genai.GenerativeModel('gemini-1.5-pro')
        self.flash_model = genai.GenerativeModel('gemini-1.5-flash')
        self.vision_model = genai.GenerativeModel('gemini-1.5-pro-vision')
        
        # Safety settings for academic content
        self.safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
    
    async def generate_text(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        use_flash: bool = False
    ) -> str:
        """Generate text using Gemini Pro or Flash"""
        model = self.flash_model if use_flash else self.text_model
        
        response = await model.generate_content_async(
            prompt,
            generation_config={
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            },
            safety_settings=self.safety_settings
        )
        
        return response.text
    
    async def generate_text_stream(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        use_flash: bool = False
    ) -> AsyncIterator[str]:
        """Stream text generation from Gemini"""
        model = self.flash_model if use_flash else self.text_model
        
        response = await model.generate_content_async(
            prompt,
            generation_config={
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            },
            safety_settings=self.safety_settings,
            stream=True
        )
        
        async for chunk in response:
            if chunk.text:
                yield chunk.text
    
    async def analyze_image(
        self,
        image_path: str | Path,
        prompt: str = "Provide a detailed scientific description of this image."
    ) -> str:
        """Analyze image using Gemini Vision
        
        Args:
            image_path: Path to image file
            prompt: Analysis prompt
            
        Returns:
            Textual description/analysis of the image
        """
        image_path = Path(image_path)
        
        # Read image file
        with open(image_path, 'rb') as f:
            image_data = f.read()
        
        # Prepare image for Gemini
        image_parts = [
            {
                "mime_type": f"image/{image_path.suffix[1:]}",
                "data": base64.b64encode(image_data).decode('utf-8')
            }
        ]
        
        response = await self.vision_model.generate_content_async(
            [prompt, image_parts[0]],
            safety_settings=self.safety_settings
        )
        
        return response.text
    
    async def classify_intent(self, query: str) -> str:
        """Classify user intent for routing
        
        Returns: "SEARCH" | "CHAT" | "DRAFT" | "ANALYZE"
        """
        prompt = f"""Classify the following user query into ONE of these categories:
- SEARCH: User wants to find research papers
- DRAFT: User wants to write/generate academic text
- ANALYZE: User wants to analyze data/images
- CHAT: General question or discussion

Query: "{query}"

Return ONLY the category name, nothing else."""
        
        result = await self.generate_text(prompt, temperature=0.1, use_flash=True)
        intent = result.strip().upper()
        
        if intent in ["SEARCH", "DRAFT", "ANALYZE", "CHAT"]:
            return intent
        return "CHAT"  # Default fallback
    
    async def score_paper_relevance(
        self,
        paper_title: str,
        paper_abstract: str,
        query: str
    ) -> float:
        """Score paper relevance to query (0.0 to 1.0)"""
        prompt = f"""Rate how relevant this paper is to the user's query on a scale of 0.0 to 1.0.

Query: "{query}"

Paper Title: {paper_title}
Abstract: {paper_abstract}

Return ONLY a decimal number between 0.0 and 1.0, nothing else."""
        
        try:
            result = await self.generate_text(prompt, temperature=0.2, use_flash=True)
            score = float(result.strip())
            return max(0.0, min(1.0, score))  # Clamp to [0, 1]
        except ValueError:
            return 0.5  # Default medium relevance if parsing fails


# Global client instance
gemini_client = GeminiClient()
