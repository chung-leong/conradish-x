# Conradish

**Conradish** is blah blah blah

# Features

* [About](#conradish)
* [Features](#features)
* [User Guide](#user-guide)
  - [Creating print version of article](#creating-print-version-of-article)
  - [Annotating article](#annotating-article)
     - [Adding a definition](#adding-definition)
     - [Adding translation/explanation](#adding-translationexplanation)
     - [Removing footnotes](#removing-footnotes)
     - [Applying text style](#applying-text-style)
  - [Removing irrelevant contents](#removing-irrelevant-contents)
  - [Printing](#printing)
  - [Finding documents](#finding-documents)
* [Limitations](#limitations)
* [Privacy](#privacy)

# User Guide

## Creating print version of article

To create a print version of the article you're viewing, first select the portion that you wish to print. Then right click (or press the menu key on your keyboard) and choose "Create print version":

![Context menu](doc/img/capture-1.jpg)

You can trigger the same action in the extension's menu, if you elect to not add an extra item to the browser's context menu:

![Pop-up menu](doc/img/capture-2.jpg)

The print version will open up in a new browser tab:

![Print version](doc/img/document-1.jpg)

## Annotating article

### Adding definition

Select the term for which the definition is desired. A pop-up menu will appear underneath. Choose "Add definition":

![Annotation menu](doc/img/annotate-1.jpg)

If the "To" language specified in the side-bar differs from the "From" language, Conradish will look up the definition at Google Translate and insert it automatically as a footnote:

![Footnote](doc/img/footnote-1.jpg)

If the "To" language matches the "From" language or it is "None", then you'll need enter the definition yourself.

![Footnote](doc/img/footnote-2.jpg)

You can undo the operation by pressing **Ctrl-Z** on your keyboard.

### Adding translation/explanation

Select the sentence you wish translated. A pop-up menu will appear underneath. Choose "Add translation":

![Annotation menu](doc/img/annotate-2.jpg)

The translated sentence will then appear in the footer:

![Footnote](doc/img/footnote-3.jpg)

The "Add translation" function only differs from "Add definition" in that the original text is omitted from the footnote.

The "Add explanation" option will appear in the menu instead when the "To" language is the same as the "From" language or "None".

### Removing footnotes

To remove a footnote, simply delete the associated footnote number (by press Backspace):

![Footnote number](doc/img/footnote-number-1.jpg)

Or delete the footnote entry:

![Footnote](doc/img/footnote-4.jpg)

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
| **Ctrl-\**           | Clear formatting  |
| **Ctrl-1**           | Heading 1         |
| **Ctrl-2**           | Heading 2         |
| **Ctrl-3**           | Heading 3         |
| **Ctrl-4**           | Heading 4         |
| **Ctrl-5**           | Heading 5         |
| **Ctrl-6**           | Heading 6         |
| **Ctrl-0**           | Regular text      |

## Removing irrelevant contents

By default, Conradish will automatically filter out contents it deems irrelevant (based on their on-screen position). Sometimes bylines and dates can be removed as a result. Too see (and perhaps restore) what got filtered out, press **Ctrl-Shift-H**.

Initial view:

![Initial view](doc/img/filter-1.jpg)

With hidden contents:

![Complete view](doc/img/filter-2.jpg)

Filtered contents will appear in red. Contents that Conradish deemed questionable will pulsate in yellow (in the example above, the line "*Catch up on the developing stories making headlines.*" is probably not something you want to keep).

Click on a section to either restore or hide it. When you're done, press **Ctrl-Shift-H** again. 

## Printing

# Limitations

# Privacy
