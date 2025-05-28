#!/bin/bash

# Deep Dict - Project Knowledge Sync Script
# This script copies all relevant files to project_knowledge/ folder for Claude context

echo "🔄 Syncing project knowledge files..."

# Clear existing files
rm -rf project_knowledge/*
mkdir -p project_knowledge

# Core configuration files
echo "📁 Copying configuration files..."
config_files=(
    "package.json"
    "next.config.js" 
    "tailwind.config.js"
    "postcss.config.js"
    "tsconfig.json"
    "eslint.config.mjs"
    ".env.example"
    ".gitignore"
    "README.md"
    "next-env.d.ts"
)

for file in "${config_files[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" project_knowledge/
        echo "  ✓ $file"
    else
        echo "  ⚠ Missing: $file"
    fi
done

# Copy CSS files with proper path handling
echo "🎨 Copying CSS files..."
css_files=(
    "src/app/globals.css"
)

for file in "${css_files[@]}"; do
    if [ -f "$file" ]; then
        flat_name=$(echo "$file" | sed 's|/|__|g' | sed 's|^src__||')
        cp "$file" "project_knowledge/$flat_name"
        echo "  ✓ $file -> $flat_name"
    else
        echo "  ⚠ Missing: $file"
    fi
done

# Copy all TypeScript/TSX/JS files from src directory recursively
echo "💻 Copying all source files..."
file_count=0

if [ -d "src" ]; then
    find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) | sort | while read file; do
        if [ -f "$file" ]; then
            # Create flattened name: src/app/page.tsx -> app__page.tsx
            flat_name=$(echo "$file" | sed 's|/|__|g' | sed 's|^src__||')
            cp "$file" "project_knowledge/$flat_name"
            echo "  ✓ $file -> $flat_name"
            file_count=$((file_count + 1))
        fi
    done
else
    echo "  ⚠ No src directory found"
fi

# Copy AI Prompts
echo "🤖 Copying AI prompts..."
if [ -d "data/prompts" ]; then
    find data/prompts -type f -name "*.txt" | sort | while read file; do
        flat_name=$(echo "$file" | sed 's|/|__|g')
        cp "$file" "project_knowledge/$flat_name"
        echo "  ✓ $file -> $flat_name"
    done
else
    echo "  ⚠ No data/prompts directory found"
fi

# Copy useful scripts for debugging/development context
echo "🔧 Copying development scripts..."
if [ -d "scripts" ]; then
    find scripts -type f \( -name "*.js" -o -name "*.ts" -o -name "*.sh" \) | sort | while read file; do
        flat_name=$(echo "$file" | sed 's|/|__|g')
        cp "$file" "project_knowledge/$flat_name"
        echo "  ✓ $file -> $flat_name"
    done
else
    echo "  ⚠ No scripts directory found"
fi

# Copy documentation files
echo "📚 Copying documentation..."
doc_files=(
    "PROJECT-KNOWLEDGE-README.md"
    "docs/"
)

for item in "${doc_files[@]}"; do
    if [ -f "$item" ]; then
        cp "$item" project_knowledge/
        echo "  ✓ $item"
    elif [ -d "$item" ]; then
        find "$item" -type f \( -name "*.md" -o -name "*.txt" \) | while read file; do
            flat_name=$(echo "$file" | sed 's|/|__|g')
            cp "$file" "project_knowledge/$flat_name"
            echo "  ✓ $file -> $flat_name"
        done
    fi
done

# Check for any additional important files in subdirectories
echo "🔍 Checking for additional files..."

# Look for any README files in subdirectories
find . -name "README.md" -not -path "./project_knowledge/*" -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./.git/*" | while read file; do
    flat_name=$(echo "$file" | sed 's|^\./||' | sed 's|/|__|g')
    cp "$file" "project_knowledge/$flat_name"
    echo "  ✓ Found additional: $file -> $flat_name"
done

# Look for any config files we might have missed
find . -maxdepth 2 -name "*.config.*" -not -path "./project_knowledge/*" -not -path "./node_modules/*" | while read file; do
    if [ ! -f "project_knowledge/$(basename "$file")" ]; then
        cp "$file" project_knowledge/
        echo "  ✓ Found config: $file"
    fi
done

# Create detailed file inventory with proper quoting
echo "📋 Creating detailed file inventory..."
{
    echo "=== PROJECT KNOWLEDGE INVENTORY ==="
    echo "Generated: $(date)"
    echo "Total files: $(find project_knowledge/ -type f | grep -v FILE_LIST.txt | wc -l)"
    echo ""
    echo "=== CONFIGURATION FILES ==="
    find project_knowledge/ -type f \( -name "*.json" -o -name "*.js" -o -name "*.mjs" -o -name "*.css" \) -exec ls -la {} \;
    echo ""
    echo "=== SOURCE CODE FILES ==="
    find project_knowledge/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" \) -exec ls -la {} \;
    echo ""
    echo "=== PROMPT FILES ==="
    find project_knowledge/ -type f -name "*.txt" -exec ls -la {} \;
    echo ""
    echo "=== SCRIPT FILES ==="
    find project_knowledge/ -type f -name "scripts__*" -exec ls -la {} \;
    echo ""
    echo "=== DOCUMENTATION FILES ==="
    find project_knowledge/ -type f -name "*.md" -exec ls -la {} \;
    echo ""
    echo "=== ALL FILES (sorted by type) ==="
    ls -la project_knowledge/ | sort -k9
} > project_knowledge/FILE_LIST.txt

# Calculate summary statistics
echo ""
echo "📊 SYNC SUMMARY:"
total_files=$(find project_knowledge/ -type f | wc -l)
config_files=$(find project_knowledge/ -type f \( -name "*.json" -o -name "*.js" -o -name "*.mjs" -o -name "*.css" \) | wc -l)
source_files=$(find project_knowledge/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" \) | wc -l)
prompt_files=$(find project_knowledge/ -type f -name "*.txt" | wc -l)
script_files=$(find project_knowledge/ -type f -name "scripts__*" | wc -l)
doc_files=$(find project_knowledge/ -type f -name "*.md" | wc -l)

echo "  📁 Total files: $total_files"
echo "  ⚙️  Config files: $config_files"
echo "  💻 Source files: $source_files" 
echo "  🤖 Prompt files: $prompt_files"
echo "  🔧 Script files: $script_files"
echo "  📚 Documentation: $doc_files"
echo ""
echo "✅ Files ready for Claude upload in: project_knowledge/"
echo "📋 Detailed inventory: project_knowledge/FILE_LIST.txt"

# Show what was found vs what might be missing
echo ""
echo "🔍 COVERAGE ANALYSIS:"

# Check for expected directories and their coverage
expected_dirs=("src/app" "src/components" "src/hooks" "src/lib" "src/stores" "data/prompts" "scripts")
for dir in "${expected_dirs[@]}"; do
    if [ -d "$dir" ]; then
        file_count=$(find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.txt" \) | wc -l)
        synced_count=$(find project_knowledge/ -name "*$(echo "$dir" | sed 's|/|__|g')*" | wc -l)
        echo "  📂 $dir: $file_count files found, estimated $synced_count synced"
    else
        echo "  ⚠ Directory not found: $dir"
    fi
done

# Show any TypeScript files that might have been missed
echo ""
echo "🔎 VERIFICATION - Files in src/ vs synced:"
src_ts_count=$(find src -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | wc -l)
synced_ts_count=$(find project_knowledge/ -type f \( -name "*.ts" -o -name "*.tsx" \) | grep -v FILE_LIST.txt | wc -l)
echo "  📄 TypeScript files in src/: $src_ts_count"
echo "  📄 TypeScript files synced: $synced_ts_count"

if [ "$src_ts_count" -ne "$synced_ts_count" ]; then
    echo "  ⚠ Mismatch detected! Check for missing files."
    echo "  💡 Run: diff <(find src -name '*.ts*' | sort) <(find project_knowledge -name '*.ts*' | sed 's|project_knowledge/||' | sed 's|__|/|g' | sed 's|^|src/|' | sort)"
else
    echo "  ✅ All TypeScript files appear to be synced"
fi

echo ""
echo "🎯 SYNC COMPLETE! Ready for Claude context sharing."