#!/bin/bash

# Omnidict - Project Knowledge Sync Script v3.0 - ACTUALLY WORKING VERSION
# This script copies all relevant files to project_knowledge/ folder for Claude context

set -e  # Exit on error only

# Configuration
readonly KNOWLEDGE_DIR="project_knowledge"
readonly BACKUP_DIR="${KNOWLEDGE_DIR}_backup_$(date +%Y%m%d_%H%M%S)"

# Colors
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
success() { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
error() { echo -e "${RED}❌ $*${NC}"; }

# Simple, working functions
main() {
    info "🔄 Starting Omnidict knowledge sync..."
    
    # Create backup if needed
    if [ -d "$KNOWLEDGE_DIR" ] && [ "$(ls -A "$KNOWLEDGE_DIR" 2>/dev/null || echo)" ]; then
        info "Creating backup: $BACKUP_DIR"
        cp -r "$KNOWLEDGE_DIR" "$BACKUP_DIR" || warn "Backup failed, continuing..."
    fi
    
    # Clear and recreate
    rm -rf "${KNOWLEDGE_DIR}"
    mkdir -p "$KNOWLEDGE_DIR"
    
    # Generate project tree
    info "🌳 Generating project tree..."
    if command -v tree >/dev/null 2>&1; then
        tree -I 'node_modules|.next|.git|*.log|dist|build|project_knowledge' -a -L 4 > "${KNOWLEDGE_DIR}/project_tree.txt"
        success "Project tree generated"
    else
        warn "Tree command not found, using find fallback"
        find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.json" -o -name "*.md" \) \
            -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./.git/*" \
            | head -100 > "${KNOWLEDGE_DIR}/project_tree.txt"
    fi
    
    # Copy config files
    info "📁 Copying configuration files..."
    local config_count=0
    for file in package.json next.config.js tailwind.config.js postcss.config.js tsconfig.json \
                eslint.config.mjs .env.example .gitignore README.md next-env.d.ts; do
        if [ -f "$file" ]; then
            cp "$file" "${KNOWLEDGE_DIR}/" && echo "  ✓ $file" && config_count=$((config_count + 1))
        else
            warn "Missing: $file"
        fi
    done
    success "Config files: $config_count copied"
    
    # Copy info/doc files
    info "📚 Copying documentation files..."
    local doc_count=0
    for file in "PROJECT-KNOWLEDGE-README.md" "ui_layout_format.md" "Omnidict Development Roadmap.md" "sync-project-knowledge.sh"; do
        if [ -f "$file" ]; then
            cp "$file" "${KNOWLEDGE_DIR}/" && echo "  ✓ $file" && doc_count=$((doc_count + 1))
        else
            warn "Missing: $file"
        fi
    done
    success "Documentation files: $doc_count copied"
    
    # Copy CSS
    info "🎨 Copying CSS files..."
    if [ -f "src/app/globals.css" ]; then
        cp "src/app/globals.css" "${KNOWLEDGE_DIR}/app__globals.css"
        success "CSS: src/app/globals.css -> app__globals.css"
    else
        warn "Missing: src/app/globals.css"
    fi
    
    # Copy all source files with flattening
    info "💻 Copying source files..."
    local source_count=0
    if [ -d "src" ]; then
        find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) | while read -r file; do
            if [ -f "$file" ]; then
                # Flatten: src/app/page.tsx -> app__page.tsx
                local flat_name
                flat_name=$(echo "$file" | sed 's|/|__|g' | sed 's|^src__||')
                cp "$file" "${KNOWLEDGE_DIR}/$flat_name"
                echo "  ✓ $file -> $flat_name"
            fi
        done
        # Count files after copying
        source_count=$(find "${KNOWLEDGE_DIR}" -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | wc -l)
        success "Source files: $source_count copied"
    else
        warn "No src directory found"
    fi
    
    # Copy AI prompts
    info "🤖 Copying AI prompts..."
    local prompt_count=0
    if [ -d "data/prompts" ]; then
        find data/prompts -name "*.txt" | while read -r file; do
            local flat_name
            flat_name=$(echo "$file" | sed 's|/|__|g')
            cp "$file" "${KNOWLEDGE_DIR}/$flat_name"
            echo "  ✓ $file -> $flat_name"
        done
        prompt_count=$(find "${KNOWLEDGE_DIR}" -name "*prompts*.txt" | wc -l)
        success "AI prompts: $prompt_count copied"
    else
        warn "No data/prompts directory found"
    fi
    
    # Create inventory
    info "📋 Creating file inventory..."
    local total_files
    total_files=$(find "${KNOWLEDGE_DIR}" -type f | wc -l)
    
    {
        echo "=== OMNIDICT PROJECT KNOWLEDGE INVENTORY ==="
        echo "Generated: $(date)"
        echo "Total files: $total_files"
        echo ""
        echo "=== CONFIGURATION FILES ==="
        find "${KNOWLEDGE_DIR}" -name "*.json" -o -name "*.js" -o -name "*.mjs" -o -name "*.css" | sort
        echo ""
        echo "=== DOCUMENTATION FILES ==="
        find "${KNOWLEDGE_DIR}" -name "*.md" -o -name "project_tree.txt" -o -name "sync-project-knowledge.sh" | sort
        echo ""
        echo "=== AI PROMPTS ==="
        find "${KNOWLEDGE_DIR}" -name "*prompts*.txt" | sort
        echo ""
        echo "=== SOURCE CODE FILES ==="
        find "${KNOWLEDGE_DIR}" -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" | sort
        echo ""
        echo "=== ALL FILES ==="
        find "${KNOWLEDGE_DIR}" -type f | sort
    } > "${KNOWLEDGE_DIR}/FILE_INVENTORY.txt"
    
    # Create simple log
    {
        echo "=== Omnidict Knowledge Sync Log ==="
        echo "Completed: $(date)"
        echo "Total files: $total_files"
        echo "Success!"
    } > "${KNOWLEDGE_DIR}/sync.log"
    
    # Final summary
    echo ""
    success "🎯 SYNC COMPLETE!"
    info "📁 Total files: $total_files"
    info "📂 Directory: ${KNOWLEDGE_DIR}/"
    info "💾 Size: $(du -sh "${KNOWLEDGE_DIR}" | cut -f1)"
    echo ""
    info "💡 Ready for Claude upload:"
    info "   Select all files in ${KNOWLEDGE_DIR}/ and drag to Claude"
    
    # Cleanup backup
    if [ -d "$BACKUP_DIR" ]; then
        rm -rf "$BACKUP_DIR"
        info "🧹 Cleaned up backup"
    fi
}

# Run it
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi