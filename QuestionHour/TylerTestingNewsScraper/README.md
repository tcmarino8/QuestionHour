# Historical news question tester

This standalone command tests the daily question prompt without starting the app,
writing to Neo4j, changing the current question, or using the local question bank.
It makes a real OpenAI request and may incur API charges.

From the `QuestionHour` application directory, run:

```powershell
node .\TylerTestingNewsScraper\test-question-generation.js 2025-11-17
```

Omit the date to enter it interactively. Use a past date in `YYYY-MM-DD` format;
the date and news window use the Los Angeles calendar. Node.js 18 or newer and
the application's installed dependencies are required. Set `OPENAI_API_KEY` in
the environment or the application's existing `.env` file. The tester prints
the weekday, theme, eligible headlines and their links, the selected target
headlines, returned model and response ID, and the generated statement. Only
the selected headline titles are sent in the prompt; source links are displayed
but not sent. The key is used for authentication and is not printed.

The weekday themes, GPT model, prompt, and generation settings are shared with
the actual daily generation code. Like the application, Sundays are reflection
days and do not call GPT. Choose another weekday to test GPT.

The selector chooses the largest group of three or more headlines that share
at least two significant words, ignoring publisher suffixes and common words.
Ties favor the earliest Google News results. If there is no such group, it uses
the first result in Google's returned order. This is a conservative
word-overlap heuristic, not semantic analysis or article view counts: related
stories using different words may be missed, and a shared phrase can group
different stories. Google News order is only a relevance proxy, not a measure
of popularity. The live generator uses the same selector.

The live generator reports an error instead of silently publishing a question
from the local bank if news or GPT generation fails. Set
`ALLOW_LOCAL_QUESTION_FALLBACK=true` in the server environment to opt into the
old fallback behavior. Existing current questions are not replaced solely
because this setting changes, and Sunday remains a non-AI reflection day.

For historical testing, the tester asks Google News for articles published
within the seven Los Angeles calendar days ending on the selected date, as of
the end of that day. This is intentionally different from the live pipeline's
current-news search: it cannot reconstruct exactly what the live app would have
seen at its rotation time. Google News may not provide results for every past
date. Missing articles, a missing key, and OpenAI errors are reported as
failures rather than silently using fallback questions.

Run the isolated tests with:

```powershell
node --test .\TylerTestingNewsScraper\test-question-generation.test.js
```
