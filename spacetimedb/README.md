# spacetimedb

Owned by Seat A.

A scaffolds the module here with:

```
spacetime dev --template basic-ts
```

The two Claude Code skills from the design doc's "Start here" section are installed with:

```
npx -y skills add clockworklabs/spacetimedb --skill spacetimedb-concepts --agent claude-code
npx -y skills add clockworklabs/spacetimedb --skill spacetimedb-cli --agent claude-code
```

The design doc also lists a third, `spacetimedb-best-practices`, installed with:

```
npx skills add https://github.com/douglance/stdb-skills --skill spacetimedb-best-practices
```
