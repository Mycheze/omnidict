# Omnidict - Development Roadmap

**Last Updated**: 02-06-2025
**Current Status**: <1,000 entries, core functionality complete

---

## 🐛 Critical Bugs (High Priority)

### **BUG-001: Global typing lag across all inputs**
**Issue**: All text inputs have a ~0.2 second delay that varies intermittently.
**Severity**: High - affects core usability
**Plan**: Investigate React re-render cycles, debouncing conflicts, and state update batching. Check for expensive operations on input change.
**Code**: Start with `hooks__useDebounce.ts`, `components__ContextSearch.tsx`, and main input handlers in `app__page.tsx`

### **BUG-002: Mobile text input reversal (Brave browser)**
**Issue**: On mobile Brave browser, text input gets reversed (e.g., "Slovak" becomes "kavolS").
**Severity**: High - critical mobile bug
**Plan**: Debug mobile-specific input event handling and potential RTL/LTR text direction conflicts.
**Code**: `components__settings__LanguageManagement.tsx` input handlers and mobile CSS in `app__globals.css`

### **BUG-003: Recent entries show entries from different language pairs**
**Issue**: The recent entries list displays entries that don't match the current source/target language selection.
**Severity**: Medium - core functionality issue
**Plan**: Filter recent entries by current language settings in `useDictionaryStore.addToRecentEntries()`
**Code**: `stores__dictionaryStore.ts` line 84 - need to add language filtering logic

### **BUG-004: Search filter persistence issue**
**Issue**: Clicking on a dictionary entry clears the current search filter, losing user's search context.
**Expected**: Search filter should persist with a clear "×" button to manually reset.
**Severity**: Medium - UX improvement
**Plan**: Modify `handleSearchEntry` in `app__page.tsx` to preserve search state and add clear button
**Code**: `app__page.tsx` lines 110-116

### **BUG-005: Visual duplicate entries in UI list**
**Issue**: Same entry appears multiple times in the dictionary list (though backend may not create duplicates).
**Severity**: Medium - visual bug
**Plan**: Debug entry deduplication logic and add unique keys to React list rendering
**Code**: `app__page.tsx` lines 230-250 (dictionary list rendering)

---

## 🌍 Language & Localization Issues

### **BUG-006: Part of speech always displays in English**
**Issue**: Part of speech labels (noun, verb, etc.) aren't localized to match the interface language.
**Severity**: Medium - localization issue
**Plan**: Create translation mappings for grammatical terms in `lib__ai__index.ts`
**Code**: `lib__ai__index.ts` lines 180-220 (entry generation)

### **BUG-007: Character-based language translation failures**
**Issue**: All character-based languages (Chinese, Japanese, etc.) lack translations in the example sentences.
**Severity**: High - affects entire language families
**Plan**: Debug AI prompt handling for non-Latin scripts, check Unicode encoding, and test prompt effectiveness with character-based languages specifically
**Code**: `data__prompts__prompt.txt` (may need character-specific prompts or prompt re-engineering), `lib__ai__index.ts` language detection logic

### **BUG-008: Non-English native language search problems**
**Issue**: When searching for words in non-English base languages, the system fails and uses the base language as the headword (if a Polish speaker is learning German and searches a Polish word, that word is added as the headword, despite the correct German being generated for the rest of the entry).
**Severity**: High - affects non-English users
**Plan**: Improve language detection logic in `detectLanguageDirection()`
**Code**: `lib__ai__index.ts` lines 50-120

### **BUG-009: Confusing language selector labels**
**Issue**: "From" and "To" labels are unclear - should be "Base Language" and "Target Language".
**Severity**: Low - UX clarity
**Plan**: Update labels in `LanguageSelector` component
**Code**: `components__LanguageSelector.tsx` and `app__page.tsx`

### **BUG-010: Language list organization issues**
**Issue**: Added languages appear messy and non-standardized in the management interface.
**Severity**: Medium - language management UX
**Plan**: Improve language validation and display formatting in language management
**Code**: `components__settings__LanguageManagement.tsx`

### **BUG-011: Language verification system broadly dysfunctional**
**Issue**: Language validation fails for most languages and is easily fooled by invalid inputs.
**Severity**: Medium - core language management is unreliable
**Plan**: Completely audit the language validation prompt and response parsing. Test with edge cases and improve validation logic.
**Code**: `app__api__languages__validate__route.ts`, `data__prompts__language_validation_prompt.txt`, and validation response parsing

---

## 📱 Mobile & UI Issues

### **BUG-012: Context search component centering issue**
**Issue**: Context-aware search component has awkward centering within its container.
**Severity**: Low - visual polish
**Plan**: Review CSS layout in context search component
**Code**: `components__ContextSearch.tsx` and related CSS in `app__globals.css`

---

## ⚡ Performance Issues (Critical for Scale)

### **BUG-013: Database architecture not optimized for scale**
**Issue**: Current database performance issues with <1000 entries will become critical at target 100k+ entries.
**Severity**: Critical - architectural blocker for scalability
**Plan**: 
1. Audit all database queries for N+1 problems
2. Add comprehensive indexing strategy
3. Implement pagination for all list views
4. Add query result caching
5. Consider database connection pooling
**Code**: `lib__database__index.ts` - complete performance audit needed

### **BUG-014: Database loading lag will compound with scale**
**Issue**: Startup lag with small DB will become unusable at 100k entries.
**Severity**: High - architectural blocker
**Plan**: 
1. Implement lazy loading of entries
2. Add database connection pooling
3. Cache frequently accessed data
4. Consider background indexing
**Code**: `lib__database__index.ts` constructor and `useDictionary.loadAllEntries()`

---

## 🎨 Core UI/UX Features (High Priority)

### **FEAT-001: Dark Mode Implementation**
**Description**: Add dark theme toggle with system preference detection.
**Priority**: High - user experience improvement
**Plan**: Implement theme context with CSS custom properties and theme toggle component
**Code**: Extend `app__globals.css` dark theme, add theme provider to `app__layout.tsx`

### **FEAT-002: Rebrand to "Omnidict"**
**Description**: Update all branding, titles, and references from "Deep Dict" to "Omnidict".
**Priority**: High - brand identity
**Plan**: Global find/replace across codebase, update metadata and titles
**Code**: `app__layout.tsx` metadata, `app__page.tsx` header, `package.json`, and README

### **FEAT-003: Font and Text Size Customization**
**Description**: Allow users to adjust font family and text size for better readability.
**Priority**: Medium - accessibility improvement
**Plan**: Add theme settings to user preferences with CSS custom properties
**Code**: Extend `stores__settingsStore.ts` and `app__globals.css`

### **FEAT-004: Mobile UI Optimization**
**Description**: Improve mobile responsive design and touch interactions.
**Priority**: High - mobile usability
**Plan**: Review and enhance mobile-specific CSS, add touch gestures
**Code**: `app__globals.css` and component-specific mobile styles

---

## 🔧 Core Functionality Enhancements

### **FEAT-005: Manual Entry Editing**
**Description**: Allow users to make small corrections to generated entries without full regeneration.
**Priority**: Medium - user control
**Plan**: Add edit mode to entry display with form inputs for each field
**Code**: Extend `app__page.tsx` entry display section with edit functionality

### **FEAT-006: User Notes on Entries**
**Description**: Let users add personal notes/comments to dictionary entries.
**Priority**: Medium - personalization
**Plan**: Extend database schema and add notes UI to entry display
**Code**: Add notes table to `lib__database__index.ts` and UI to entry display

### **FEAT-007: Phrase and Multi-word Expression Support**
**Description**: Better handling of phrases, idioms, and compound expressions.
**Priority**: Medium - language learning enhancement
**Plan**: Enhance AI prompts and add phrase detection logic
**Code**: Modify prompts in `data__prompts__` and `lib__ai__index.ts`

### **FEAT-008: Dialect Configuration**
**Description**: Support for regional dialects and language variants.
**Priority**: Low - advanced language support
**Plan**: Extend language management to include dialect options
**Code**: Modify `components__settings__LanguageManagement.tsx` and language validation

---

## 🌐 Integration & Extensions

### **FEAT-009: Omnidict+ Browser Extension**
**Description**: Create browser extension for enhanced Anki integration and clipboard monitoring without CORS issues.
**Priority**: Medium - advanced integration
**Plan**: Develop Chrome/Firefox extension that communicates with AnkiConnect directly and provides clipboard monitoring
**Code**: Create new extension project, integrate with existing `lib__anki__` modules

### **FEAT-010: Admin Database Management**
**Description**: Administrative interface to bulk delete languages or clean database.
**Priority**: Low - administrative tools
**Plan**: Create admin-protected routes with database cleanup utilities
**Code**: Add admin routes in `app__api__admin__` and admin UI components

### **FEAT-011: Error Monitoring and Reporting**
**Description**: Implement comprehensive error tracking and user feedback system.
**Priority**: Medium - system reliability
**Plan**: Add error boundary components and logging service
**Code**: Create error handling utilities and monitoring dashboard

---

## 📋 Not Now (Future Considerations)

### **FUTURE-001: AI Model Selection**
**Description**: Allow users to choose between different AI providers (currently only DeepSeek).
**Reason**: Not current focus, current AI performance is adequate

### **FUTURE-002: Clipboard Monitoring (Web)**
**Description**: Automatically detect and offer to translate text copied to clipboard.
**Reason**: Will be handled by browser extension instead

### **FUTURE-003: Audio Pronunciation (ElevenLabs)**
**Description**: Generate and store audio pronunciations for entries using ElevenLabs API.
**Reason**: Not current priority, focus on core functionality first

### **FUTURE-004: Tutorial/Onboarding Video**
**Description**: Create guided tutorial for new users.
**Reason**: Defer until UI stabilizes and core features are complete

---

## 🚀 Implementation Phases

### **Phase 1: Critical Infrastructure (Week 1-2)**
**Goal**: Ensure system can scale and core functionality works reliably

1. **BUG-013** (Database scalability) - Must fix before DB grows larger
2. **BUG-001** (Typing lag) - May be related to database performance
3. **BUG-011** (Language verification) - Core system reliability

### **Phase 2: User Experience (Week 3)**
**Goal**: Improve daily usage experience

4. **BUG-007** (Character-based languages) - Major language support gap
5. **FEAT-001** (Dark mode) - Quick UX win
6. **FEAT-002** (Rebrand to Omnidict) - Identity update

### **Phase 3: Mobile & Core Features (Week 4)**
**Goal**: Mobile optimization and feature completeness

7. **BUG-002** (Mobile text reversal) - Mobile usability
8. **BUG-003** (Recent entries filtering) - Core functionality
9. **BUG-004** (Search filter persistence) - UX improvement
10. **FEAT-004** (Mobile UI optimization) - Mobile experience

### **Phase 4: Feature Enhancement (Week 5-6)**
**Goal**: Advanced features and polish

11. **FEAT-005** (Manual entry editing) - User control
12. **FEAT-006** (User notes) - Personalization
13. **FEAT-003** (Font/text customization) - Accessibility

---

## 📊 Success Metrics

- **Performance**: Page load time <2s, input response time <100ms
- **Scale**: Handle 100k+ entries without performance degradation
- **Reliability**: Language verification accuracy >95%
- **Mobile**: Full functionality parity with desktop
- **User Experience**: Dark mode adoption, font customization usage

---

## 🔍 Known Technical Debt

- Database queries not optimized for scale
- No caching layer implemented
- Missing comprehensive error handling
- Mobile responsiveness needs systematic review
- Language validation system needs complete overhaul

---

*This roadmap should be reviewed and updated after each major release or when priorities shift.*
