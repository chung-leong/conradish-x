# Conradish

Conradish is a Chrome extension that lets you create print version of news articles with footnotes. It's designed for educators who wish to use online materials in the classroom. With its automatic translation feature, this extension is especially useful for teachers of foreign languages.

![Conradish transformation](doc/img/transform-1.jpg)

* [Features](#features)
* [User Guide](#user-guide)
  - [Creating print version of article](#creating-print-version-of-article)
  - [Annotating article](#annotating-article)
     - [Adding definition](#adding-definition)
     - [Adding translation/explanation](#adding-translationexplanation)
     - [Removing footnotes](#removing-footnotes)
     - [Applying text style](#applying-text-style)
  - [Removing irrelevant contents](#removing-irrelevant-contents)
  - [Printing](#printing)
  - [Finding documents](#finding-documents)
* [Limitations](#limitations)
* [Privacy](#privacy)

# Features

* Printing only selected portions of articles
* Removal of ads and images
* Simplification of page layout
* Editing of text before printing
* Addition of footnotes
* Integration with Google Translate

# User Guide

## Creating print version of article

To create a print version of the article you're viewing, first select the portion that you wish to print. Then right click (or press the menu key on your keyboard) and choose **Create print version**:

![Context menu](_locales/en/img/capture-1.jpg)

You can trigger the same action in the extension's menu, if you elect to not add an extra item to the browser's context menu:

![Pop-up menu](_locales/en/img/capture-2.jpg)

The print version will open up in a new browser tab:

![Print version](_locales/en/img/document-1.jpg)

## Annotating article

### Adding definition

Select the term for which the definition is desired. A pop-up menu will appear underneath. Choose "Add definition":

![Annotation menu](_locales/en/img/annotate-1.jpg)

If the **To** language specified in the side-bar differs from the **From** language, Conradish will look up the definition at Google Translate and insert it automatically as a footnote:

![Footnote](_locales/en/img/footnote-1.jpg)

If the **To** language matches the **From** language or if "None" is selected, then you'll need to enter the definition yourself.

![Footnote](_locales/en/img/footnote-2.jpg)

You can undo the result by pressing **Ctrl-Z** on your keyboard.

### Adding translation/explanation

Select the sentence you wish translated. A pop-up menu will appear underneath. Choose **Add translation**:

![Annotation menu](_locales/en/img/annotate-2.jpg)

The translated sentence will then appear in the page's footer:

![Footnote](_locales/en/img/footnote-3.jpg)

**Add translation** function only differs from **Add definition** in that the original text is omitted from the footnote.

**Add explanation** will appear in the menu instead when no translation would actually occur (the **To** language is the same as the **From** language or "None" is selected).

### Removing footnotes

To remove a footnote, simply delete the associated footnote number:

![Footnote number](_locales/en/img/footnote-number-1.jpg)

Or delete the footnote entry:

![Footnote](_locales/en/img/footnote-4.jpg)

### Applying text style

The following hot-keys can be used to add basic text style:

| Hot-key              | Text style        |
|----------------------|-------------------|
| **Ctrl-B**           | Bold              |
| **Ctrl-I**           | Italic            |
| **Ctrl-U**           | Underline         |
| **Alt-Shift-5**      | Strikethrough     |
| **Ctrl-Shift-Minus** | Subscript         |
| **Ctrl-Shift-Equal** | Superscript       |
| **Ctrl-\\**          | Clear formatting  |
| **Ctrl-1**           | Heading 1         |
| **Ctrl-2**           | Heading 2         |
| **Ctrl-3**           | Heading 3         |
| **Ctrl-4**           | Heading 4         |
| **Ctrl-5**           | Heading 5         |
| **Ctrl-6**           | Heading 6         |
| **Ctrl-0**           | Regular text      |

## Removing irrelevant contents

By default, Conradish will automatically filter out contents it deems irrelevant (based on their on-screen position). Sometimes bylines and dates can be removed as a result. Too see what got filtered out, press **Ctrl-Shift-H**.

Initial view:

![Initial view](_locales/en/img/filter-1.jpg)

With hidden contents shown:

![Complete view](_locales/en/img/filter-2.jpg)

Filtered contents will appear in red. Contents that Conradish deemed questionable will pulsate in yellow. Click on a section to restore or hide it. When you're done, press **Ctrl-Shift-H** again.

This feature is available even when **Filter page content** is disabled in the option pane.

## Printing

To print, click the **Print** button. Chrome's print window will appear. Double-check that **Paper size** matches what is set in Conradish and that **Margins** is set to "Default". The document will not print correctly if either one of these is off.

![Print window](_locales/en/img/print-1.jpg)

## Finding documents

To find a document you had created earlier, activate the extension's pop-up menu and choose **Show all documents**:

![Pop-up menu](_locales/en/img/pop-up-1.jpg)

Documents are arranged by date. If you remember particular keywords, you can narrow the search by entering them into the search box.

![Search results](_locales/en/img/search-1.jpg)

Note that older documents would get automatically deleted if you hadn't granted unlimited storage to the extension.

# Limitations

* The extension currently cannot handle right-to-left languages.
* Font selection has no impact on the display of East-Asian languages.
* Long tables can get cut off.
* User interface in English only.
* User interface is sub-optimal on devices with smaller screens.

These issues will be addressed in future versions.

# Privacy

Conradish does not capture any user information. It does not monitor your browsing history. All date is stored locally. The extension does sent text to Google for the purpose of translation. The privacy implications are the same as those of using [Google Translate](https://policies.google.com/privacy).
