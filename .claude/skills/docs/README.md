# Documentation Creation & Optimization Skill

A comprehensive skill for creating and maintaining LLM-optimized documentation in the `docs/` folder.

## Quick Start

Invoke the skill using:
```
/docs
```

Or via the Skill tool in Claude Code.

## What This Skill Does

### 1. Creates New Documentation
Analyzes your codebase and generates comprehensive, structured documentation:
- **Testing guides** - Extracted from test files, configs, and scripts
- **Development environment** - From docker-compose, package.json, Makefiles
- **API documentation** - From API route files and client code
- **Architecture docs** - From database schema, code structure, patterns
- **Workflow guides** - From scripts, CI/CD, deployment processes

### 2. Improves Existing Documentation
Optimizes docs for LLM consumption:
- Fixes heading hierarchy issues
- Adds missing frontmatter
- Improves code formatting
- Adds cross-references
- Ensures consistent terminology
- Optimizes section chunking

### 3. Audits Documentation
Identifies gaps and issues:
- Missing documentation
- LLM optimization problems
- Broken links
- Outdated content
- Prioritized recommendations

## Features

### LLM-Optimized Output
All documentation follows best practices for LLM consumption:
- ✅ Proper heading hierarchy (never skip levels)
- ✅ YAML frontmatter with metadata
- ✅ Consistent terminology throughout
- ✅ Proper inline code formatting
- ✅ Complete, runnable code examples
- ✅ Token-efficient writing (dense but readable)
- ✅ Semantic chunking (~400-1000 char sections)
- ✅ Cross-references between related docs

### Smart Content Extraction
Doesn't just create empty templates - extracts real information:
- Actual commands from your package.json and Makefile
- Real code examples from your codebase
- Configuration from your env files and configs
- Patterns and conventions from your actual code
- Database schema from migrations or ORM files

### Divio Documentation System
Organizes docs into four distinct categories:
- **tutorials/** - Learning-oriented step-by-step lessons
- **guides/** - Task-oriented "how to" documentation
- **reference/** - Information-oriented technical specifications
- **explanation/** - Understanding-oriented conceptual docs

## Usage Examples

### Create Testing Documentation
```
You: /docs
Skill: What would you like to do?
You: Create documentation for testing

→ Skill analyzes test files, configs, and generates comprehensive testing guide
```

### Create Development Environment Doc
```
You: /docs
Skill: What would you like to do?
You: Create documentation for the development environment

→ Skill analyzes docker-compose, package.json, env files, and creates setup guide
```

### Improve Existing Documentation
```
You: /docs
Skill: What would you like to do?
You: Improve docs/api-overview.md

→ Skill analyzes doc, identifies LLM optimization issues, shows improvements
```

### Audit All Documentation
```
You: /docs
Skill: What would you like to do?
You: Audit all documentation

→ Skill scans docs/, identifies gaps and issues, provides prioritized recommendations
```

### Quick Focused Documentation
```
You: /docs
Skill: What would you like to do?
You: Quick doc on authentication flow

→ Skill generates focused, concise documentation on specific topic
```

## Example Generated Documentation

### Testing Guide (`docs/guides/testing.md`)
```yaml
---
title: Testing Guide
description: Comprehensive guide to running and writing tests
category: guides
tags: [testing, vitest, postgres]
last_updated: 2025-01-07
related:
  - /docs/guides/development-environment
---

# Testing Guide

This guide covers how to run tests and write new tests for this project.

## Overview

This project uses Vitest for unit and integration testing with a real PostgreSQL test database.

## Quick Start

Run all tests in watch mode:
```bash
pnpm test
```

[... extracted from actual codebase ...]
```

### Development Environment (`docs/guides/development-environment.md`)
```yaml
---
title: Development Environment Setup
description: Set up local development environment
category: guides
tags: [setup, docker, postgres, development]
last_updated: 2025-01-07
---

# Development Environment Setup

[... actual setup commands from your project ...]
```

## Document Structure

The skill creates and maintains this standard structure:

```
docs/
├── index.md                    # Documentation landing page
├── tutorials/                  # Learning-oriented
│   ├── index.md
│   └── getting-started.md
├── guides/                     # Task-oriented
│   ├── index.md
│   ├── development-environment.md
│   ├── testing.md
│   └── workflows/
│       └── index.md
├── reference/                  # Information-oriented
│   ├── index.md
│   ├── api/
│   │   ├── index.md
│   │   └── endpoints.md
│   └── database-schema.md
└── explanation/               # Understanding-oriented
    ├── index.md
    └── architecture.md
```

## Frontmatter Standard

Every document includes YAML frontmatter:

```yaml
---
title: "Document Title"
description: "Brief summary for search and previews"
category: guides|reference|tutorials|explanation
tags: [relevant, searchable, keywords]
last_updated: YYYY-MM-DD
related:
  - /docs/path/to/related-doc-1
  - /docs/path/to/related-doc-2
---
```

## Benefits

### For Humans
- Clear, well-organized documentation
- Consistent structure across all docs
- Easy to find information
- Complete, runnable examples

### For LLMs
- Optimized for RAG retrieval
- Proper semantic chunking
- Consistent terminology for accurate understanding
- Rich metadata for context
- Token-efficient content

### For Maintenance
- Standardized format
- Easy to update
- Clear categorization
- Cross-referenced for discoverability

## Best Practices

### When Creating Documentation
1. Be specific about the topic
2. Review the generated draft carefully
3. Provide feedback on accuracy
4. Add any missing context or examples

### When Improving Documentation
1. Specify what needs improvement
2. Review the proposed changes
3. Ensure technical accuracy
4. Verify examples still work

### When Auditing
1. Review the prioritized list
2. Start with critical gaps
3. Address one document at a time
4. Keep documentation up to date

## Tips

- **Be specific**: "Create testing documentation" is better than "document the code"
- **Review drafts**: Always review generated content for accuracy
- **Update regularly**: Run audits periodically to catch outdated docs
- **Cross-reference**: The skill adds related links, but you can request more
- **Real examples**: The skill extracts from your code, but you can request specific examples

## Common Topics

The skill can document:
- Testing setup and patterns
- Development environment
- API endpoints and client usage
- Database schema and migrations
- Authentication and authorization
- Deployment workflows
- CI/CD pipelines
- Architecture and design patterns
- Configuration and environment variables
- Common troubleshooting issues
- And more...

## Technical Details

### LLM Optimization Techniques
- **Heading hierarchy**: Single H1, never skip levels
- **Summaries**: Brief paragraph after each heading
- **Code formatting**: Inline backticks, language-specific blocks
- **Chunking**: Sections ~400-1000 characters
- **Terminology**: Consistent terms, defined abbreviations
- **Cross-references**: Bidirectional links
- **Token efficiency**: Dense, concise, minimal filler
- **Divio separation**: Clear document types

### Content Extraction
The skill uses:
- `Glob` to find relevant files
- `Grep` to search for patterns
- `Read` to analyze file contents
- Code analysis to extract examples
- Configuration parsing for commands
- Schema analysis for database docs

## Troubleshooting

### "Skill doesn't understand my codebase"
- Be specific about what to document
- Point to specific files or directories
- Provide context about unconventional patterns

### "Generated documentation is inaccurate"
- Review and provide corrections
- The skill will refine based on feedback
- Add missing context or examples

### "Documentation is too generic"
- Request more specific examples
- Point to actual usage in codebase
- Ask for expansion of specific sections

## Contributing

This skill is designed to be generic and reusable across any repository. If you find patterns that should be added or improved, consider:
- Testing the skill on different codebases
- Suggesting additional documentation types
- Improving LLM optimization techniques
- Adding more extraction patterns

---

**Ready to improve your documentation?**

Invoke the skill with `/docs` and let's get started!
