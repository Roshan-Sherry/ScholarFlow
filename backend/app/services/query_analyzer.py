"""Query analysis agent for understanding and expanding research queries"""

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from typing import Dict, List
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class QueryAnalyzer:
    """Analyzes user queries and generates optimized search strategies"""
    
    def __init__(self):
        """Initialize the query analyzer with Gemini Flash"""
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash-exp",
            # temperature=0,  # Removed to fix unexpected keyword argument error
            google_api_key=settings.google_api_key
        )
        
        self.prompt = ChatPromptTemplate.from_template(
            """You are an expert academic research assistant. Your task is to analyze a user's query, potentially with conversation history, and generate a structured plan for searching academic databases.

**Instructions:**
1. **Analyze Context:** Read the provided history and the new user query to understand the user's true intent.
2. **Primary Query:** Formulate the best possible primary search query using precise, academic keywords.
3. **Expand Queries:** Generate 1-2 alternative or more specific queries that can be used if the primary query fails or to get diverse results.
4. **Chain of Thought:** Briefly explain your reasoning in a "thought" process.
5. **Output Format:** Return ONLY a valid JSON object with three keys: "thought", "search_query", and "expanded_queries" (a list of strings).

---
**Example:**
User Input:
"Previous Conversation:
User: What are RAG systems?
Assistant: RAG stands for Retrieval-Augmented Generation...

New User Query: ok how do they handle hallucinations?"

JSON Output:
```json
{{
    "thought": "The user is asking a follow-up question about how RAG systems mitigate hallucinations. I will create a primary query focused on this mechanism and an expanded query that is broader.",
    "search_query": "Retrieval-Augmented Generation techniques for hallucination reduction",
    "expanded_queries": [
        "fact-checking and grounding in RAG pipelines",
        "improving factual consistency in large language models"
    ]
}}
```
---
**User Input:**
{query}

**Conversation History:**
{history}

**JSON Output:**
"""
        )
        
        # Create the chain
        self.chain = self.prompt | self.llm | JsonOutputParser()
    
    async def analyze_query(
        self,
        query: str,
        conversation_history: List[Dict] = None
    ) -> Dict[str, any]:
        """
        Analyze a research query and generate search strategies
        
        Args:
            query: User's research question
            conversation_history: Optional list of previous messages
        
        Returns:
            Dict with 'thought', 'search_query', and 'expanded_queries'
        """
        try:
            if settings.mock_ai_responses:
                # MOCK IMPLEMENTATION - Bypass real API
                logger.info(f"MOCK MODE: Analyzing query '{query}'")
                import asyncio
                await asyncio.sleep(0.5)
                
                # Simple keyword extraction for mock
                keywords = [w for w in query.split() if len(w) > 4]
                main_topic = keywords[0] if keywords else "general research"
                
                return {
                    "thought": f"The user is asking about {query}. I will search for key papers related to {main_topic} and expand the search to cover recent developments.",
                    "search_query": f"{query} scientific overview",
                    "expanded_queries": [
                        f"{query} recent survey",
                        f"{query} methodology",
                        f"{query} challenges and limitations"
                    ]
                }

            else:
                # REAL IMPLEMENTATION
                # Format conversation history
                history_text = ""
                if conversation_history:
                    for msg in conversation_history[-5:]:  # Last 5 messages for context
                        role = msg.get('role', 'user')
                        content = msg.get('content', '')
                        history_text += f"{role.title()}: {content}\n"
                else:
                    history_text = "No previous conversation."
                
                # Invoke the chain
                result = await self.chain.ainvoke({
                    "query": query,
                    "history": history_text
                })
                
                logger.info(f"Query analysis: {result.get('search_query', query)}")
                return result
            
        except Exception as e:
            logger.error(f"Error analyzing query: {e}")
            return {
                "thought": "Error in query analysis, using original query",
                "search_query": query,
                "expanded_queries": []
            }


# Singleton instance
query_analyzer = QueryAnalyzer()
