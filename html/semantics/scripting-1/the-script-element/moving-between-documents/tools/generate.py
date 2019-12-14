template = '''<!DOCTYPE html>
<meta charset="utf-8">
<meta name="timeout" content="long">
<title>Moving script elements between documents</title>
<link rel="author" href="mailto:d@domenic.me" title="Domenic Denicola">
<link rel="help" href="https://html.spec.whatwg.org/multipage/#execute-the-script-block">
<script src="/resources/testharness.js"></script>
<script src="/resources/testharnessreport.js"></script>
<script src="resources/moving-between-documents-helper.js"></script>

<body>
<script>
runTest("%s", "%s", "%s", "%s", "%s");
</script>
'''

n = 0
for timing in ["before-prepare", "after-prepare", "move-back"]:
  for destType in ["iframe", "createHTMLDocument"]:
    for result in ["fetch-error", "parse-error", "success"]:
      for inlineOrExternal in ["inline", "external"]:
        for type in ["classic", "module"]:
          # No fetch error for inline scripts.
          if result == "fetch-error" and inlineOrExternal == "inline":
            continue

          # The current test helper uses
          # #has-a-style-sheet-that-is-blocking-scripts to block script
          # evaluation after #prepare-a-script, but in some cases this
          # doesn't work:
          # - inline scripts to createHTMLDocument
          if timing != "before-prepare" and destType == "createHTMLDocument" and inlineOrExternal == "inline":
            continue
          # - module inline scripts https://github.com/whatwg/html/issues/3890
          if timing != "before-prepare" and inlineOrExternal == "inline" and type == "module":
            continue

          with open('%s-%s-%s-%s-%s.html' % (timing, destType, result, inlineOrExternal, type), 'w') as f:
            f.write(template % (timing, destType, result, inlineOrExternal, type))
