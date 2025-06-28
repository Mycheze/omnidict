# Omnidict - UI Layout Reference

## Layout Communication Format

Use this standardized format to describe UI positioning and layout changes:

### Syntax
```
LAYOUT[screen_size]: 
├── CONTAINER[type]
│   ├── REGION[name] {size}
│   │   ├── COMPONENT[name] {properties}
│   │   └── COMPONENT[name] {properties}
│   └── REGION[name] {size}
│       └── COMPONENT[name] {properties}
```

### Screen Size Codes
- `mobile`: < 768px
- `tablet`: 768px - 1024px  
- `desktop`: > 1024px

### Container Types
- `full`: Full viewport (min-h-screen)
- `centered`: Centered with max-width
- `fluid`: Full width container

### Region Size Notation
- `{1/3}`: One-third width
- `{2/3}`: Two-thirds width
- `{full}`: Full width
- `{auto}`: Auto-sizing

### Component Properties
- `{fixed}`: Fixed positioning
- `{sticky}`: Sticky positioning
- `{expand}`: Expandable/collapsible
- `{overlay}`: Overlays other content

---

## Current Layout: Deep Dict Main Page

### Desktop Layout
```
LAYOUT[desktop]:
├── CONTAINER[full]
│   ├── REGION[header] {full}
│   │   ├── COMPONENT[logo] {left}
│   │   ├── COMPONENT[language_selectors] {center}
│   │   └── COMPONENT[settings_button] {right}
│   ├── REGION[main_content] {centered}
│   │   ├── REGION[left_panel] {1/3}
│   │   │   ├── COMPONENT[recent_entries] {auto, expand}
│   │   │   ├── COMPONENT[filter_search] {auto}
│   │   │   └── COMPONENT[dictionary_list] {auto, scroll}
│   │   └── REGION[center_panel] {2/3}
│   │       ├── COMPONENT[error_display] {auto, conditional}
│   │       ├── COMPONENT[entry_display] {auto}
│   │       ├── COMPONENT[add_new_word] {auto}
│   │       └── COMPONENT[context_search] {auto, expand}
│   └── REGION[overlays] {full}
│       ├── COMPONENT[api_queue_status] {fixed, bottom-right}
│       └── COMPONENT[settings_modal] {overlay, conditional}
```

### Mobile Layout
```
LAYOUT[mobile]:
├── CONTAINER[full]
│   ├── REGION[header] {full, stack}
│   ├── REGION[main_content] {full, stack}
│   │   ├── COMPONENT[filter_search] {full}
│   │   ├── COMPONENT[add_new_word] {full}
│   │   ├── COMPONENT[context_search] {full, expand}
│   │   ├── COMPONENT[entry_display] {full}
│   │   ├── COMPONENT[recent_entries] {full, expand}
│   │   └── COMPONENT[dictionary_list] {full, scroll}
│   └── REGION[overlays] {full}
│       ├── COMPONENT[api_queue_status] {fixed, bottom-center}
│       └── COMPONENT[settings_modal] {overlay, conditional}
```

---

## Component Positioning Reference

### Current Component Locations

| Component | Desktop Position | Mobile Position |
|-----------|------------------|-----------------|
| `ContextSearch` | center_panel/bottom | main_content/position-3 |
| `AddNewWord` | center_panel/above-context | main_content/position-2 |
| `EntryDisplay` | center_panel/main | main_content/position-4 |
| `FilterSearch` | left_panel/middle | main_content/position-1 |
| `DictionaryList` | left_panel/bottom | main_content/position-6 |
| `RecentEntries` | left_panel/top | main_content/position-5 |
| `ApiQueueStatus` | overlay/bottom-right | overlay/bottom-center |

### Relationship Notation
- `above`: Directly above component
- `below`: Directly below component  
- `beside`: Next to component (horizontal)
- `within`: Inside component
- `overlay`: Floating over component

---

## Usage Examples

### Example 1: Move component
```
MOVE: ContextSearch 
FROM: center_panel/bottom 
TO: left_panel/above[FilterSearch]
```

### Example 2: Resize region
```
RESIZE: left_panel 
FROM: {1/3} 
TO: {1/4}
RESIZE: center_panel 
FROM: {2/3} 
TO: {3/4}
```

### Example 3: Add new component
```
ADD: NewComponent
LOCATION: center_panel/below[EntryDisplay]
PROPERTIES: {auto, conditional}
```

### Example 4: Layout change
```
CHANGE: desktop_layout
MODIFY: main_content 
FROM: [left_panel{1/3}, center_panel{2/3}]
TO: [left_panel{1/4}, center_panel{1/2}, right_panel{1/4}]
```

---

## Notes for LLM Communication

- Use this format when describing layout changes
- Reference component names exactly as listed
- Include both current and desired states
- Specify screen size when behavior differs
- Use relationship notation for precise positioning