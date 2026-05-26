# list release tags
tags:
    git tag -l --sort=-creatordate

# create a release tag without pushing
tag:
    #!/usr/bin/env python3
    import json, subprocess, sys
    def run(*args): return subprocess.run(args, capture_output=True, text=True).stdout.strip()
    version = json.load(open('packages/coding-agent/package.json'))['version']
    prefix = 'v%s-crdx.' % version
    tags = [tag for tag in run('git', 'tag', '-l', '%s*' % prefix).splitlines() if tag]
    last = max((int(tag.removeprefix(prefix)) for tag in tags), default=0)
    if last > 0 and run('git', 'rev-parse', 'HEAD') == run('git', 'rev-parse', '%s%d' % (prefix, last)):
        print('no new commits since %s%d' % (prefix, last), file=sys.stderr)
        sys.exit(1)
    tag = '%s%d' % (prefix, last + 1)
    notes = run('just', 'release::notes', tag)
    message = 'Version %s\n\n%s' % (tag, notes) if notes else 'Version %s' % tag
    print('tagging %s' % tag)
    subprocess.run(['git', 'tag', '-a', tag, '-m', message], check=True)

# extract release notes for a tag from CHANGELOG.md
notes tag:
    #!/usr/bin/env python3
    import re, sys
    version = '{{ tag }}'.lstrip('v')
    lines, found = [], False
    for line in open('CHANGELOG.md'):
        if re.match(r'^## \[%s\]' % re.escape(version), line):
            found = True
            continue
        if found and line.startswith('## '):
            break
        if found:
            lines.append(line)
    print('\n'.join(lines).strip())

# push commits and a specific tag
push tag:
    git push
    git push origin "{{ tag }}"
