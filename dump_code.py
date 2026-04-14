import os

# The directories we DO NOT want the Librarian to read
IGNORE_DIRS = {
    'node_modules', '.next', '.git', 'dist', 'build', 
    '.vercel', 'public', 'content', 'node_modules'
}

# The file types that actually contain the logic and styling
ALLOWED_EXTENSIONS = {'.ts', '.tsx', '.css', '.js', '.jsx', '.json'}

def generate_code_dump(root_dir='.', output_file='high_ground_tome.txt'):
    print(f"📚 The Librarian is scanning the stacks in {os.path.abspath(root_dir)}...")
    
    with open(output_file, 'w', encoding='utf-8') as outfile:
        # Write a header
        outfile.write("# HIGH GROUND ODYSSEY - CODEBASE DUMP\n\n")
        
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Prune ignored directories so we don't even traverse them
            dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
            
            for filename in filenames:
                ext = os.path.splitext(filename)[1].lower()
                if ext in ALLOWED_EXTENSIONS:
                    filepath = os.path.join(dirpath, filename)
                    
                    # Skip package-lock or pnpm-lock to save massive space
                    if 'lock' in filename.lower():
                        continue
                        
                    try:
                        with open(filepath, 'r', encoding='utf-8') as infile:
                            content = infile.read()
                            
                            # Write the file path as a clear header
                            outfile.write(f"// ==========================================\n")
                            outfile.write(f"// FILE: {filepath}\n")
                            outfile.write(f"// ==========================================\n\n")
                            outfile.write(content)
                            outfile.write("\n\n")
                    except Exception as e:
                        print(f"⚠️ Could not read {filepath}: {e}")

    print(f"✅ Scanning complete. The tome has been written to: {output_file}")

if __name__ == "__main__":
    generate_code_dump()