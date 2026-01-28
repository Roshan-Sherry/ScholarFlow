"""Application configuration using Pydantic Settings"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Google Gemini API (REQUIRED - must be set in .env file)
    google_api_key: str
    
    # Database
    database_url: str = "sqlite:///./data/scholarflow.db"

    # Feature Flags - Set to False for production
    mock_ai_responses: bool = False

    # AI / LLM Configuration
    llm_provider: str = "gemini"  # "gemini", "ollama", "openai"
    text_model_name: str = "gemini-2.5-flash" # Using Flash to stay within free tier limits
    fast_model_name: str = "gemini-2.5-flash" # or "llama3:instruct", "gpt-3.5-turbo"
    vision_model_name: str = "gemini-2.5-flash" # Using Flash for vision too
    
    # Optional Custom Base URL (for Ollama/vLLM)
    llm_base_url: str | None = None
    
    # Application
    app_env: str = "development"
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    # Paths
    faiss_index_path: Path = Path("./data/indexes")
    upload_path: Path = Path("./data/uploads")
    
    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    # LangGraph Configuration
    max_search_iterations: int = 3  # Discovery Loop limit
    max_revision_iterations: int = 2  # Review Loop limit
    relevance_threshold: float = 0.6  # Paper ranking threshold
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure directories exist
        self.faiss_index_path.mkdir(parents=True, exist_ok=True)
        self.upload_path.mkdir(parents=True, exist_ok=True)


# Global settings instance
settings = Settings()
