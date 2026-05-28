from ebooklib import epub
import os
from typing import List

def compile_markdown_to_epub(title: str, author: str, markdown_chapters: List[str], output_path: str) -> str:
    """
    Compiles a list of markdown chapters into a valid EPUB file ready for Kindle KDP.
    """
    book = epub.EpubBook()
    book.set_identifier(f"id_{title.replace(' ', '_').lower()}")
    book.set_title(title)
    book.set_language('en')
    book.add_author(author)
    
    # We would theoretically convert the markdown to HTML here
    # For now we create basic chapters
    
    chapters = []
    for i, md_content in enumerate(markdown_chapters):
        c = epub.EpubHtml(title=f'Chapter {i+1}', file_name=f'chap_{i+1}.xhtml', lang='en')
        c.content = f'<h1>Chapter {i+1}</h1><p>{md_content}</p>'
        book.add_item(c)
        chapters.append(c)
        
    # Define Table Of Contents
    book.toc = tuple(chapters)
    
    # Add default NCX and Nav file
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    
    # Define spine
    book.spine = ['nav'] + chapters
    
    # Write to the file
    epub.write_epub(output_path, book, {})
    
    return output_path
