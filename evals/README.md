# Evals

Behavior evals for the plugins, run with `claude plugin eval`. The Node test suite in `test/` checks the code; these check what the agents and skills actually do when a model reads them: whether a skill fires when it should and stays quiet when it shouldn't, and whether an agent reaches the right verdict on a case with a known answer.

They call a real model on your credential, so they are slow, cost money and are noisy. They run locally and on request. CI does not run them.

```sh
npm run eval        # portable cases: needs no shell tool, runs on any OS
npm run eval:all    # everything, including cases that need a shell (macOS/Linux)
claude plugin eval . --case review-catches-sql-injection --runs 1 --scaffold --ablation none --trust-plugin --no-publish
```

Needs Claude Code 2.1.269 or later and git 2.31 or later. `--trust-plugin` asserts you trust this repository's plugins, as you do; `--scaffold` runs the `scaffold.sh` scripts in this directory as you, which is also fine for files you can read in the repo; `--no-publish` keeps the HTML report local, since it contains prompts and model output. Results go to `evals/results/`, which is ignored.

## Layout

```
evals/
  <plugin>/<case>/
    prompt.md          the prompt, and frontmatter: plugins, tags, allowed_tools, max_turns
    graders/*.md       one pass/fail check each (tool_used, regex, llm, ...)
    case.yaml          only when a case needs a scaffold script
    scaffold.sh        builds the repo the case runs in
```

Cases live here, at the repository root, and not inside the plugins, for two reasons. A case can only load plugins below the directory it lives in, and engineering-team and design-team both need team-ops. And evals would otherwise ship inside every installed plugin.

## Writing a case

**List every plugin the case needs, including dependencies.** The eval sandbox loads only the plugins in `plugins:`. `engineering-team` and `design-team` depend on `team-ops`; load one without it and the plugin is skipped entirely. Nothing fails loudly: every run just scores 0, and the only evidence is `plugin_errors` ("Dependency … is not installed") in the run's trace. `test/evals.test.mjs` fails on this before you spend anything.

```yaml
plugins: ["../../../plugins/engineering-team", "../../../plugins/team-ops"]
```

**Tag every case `portable` or `shell`.** A case that grants `Bash` or `PowerShell` is `shell`; everything else is `portable`. On Windows, shell grants are refused unless the OS sandbox is available (today it is not), so `npm run eval` selects only `portable` cases. A portable case needing repository content writes it to files in its scaffold and has the agent read them.

**Name the behavior, and test the near miss.** A skill that fires on everything costs context. For each skill there is a positive case and, where a neighbor exists, a negative case with a similar prompt that must not fire it (`api-pricing-question-skips-cost-report`). Positive prompts must not name the skill.

**Pair a result with a process check.** `review-catches-sql-injection` checks that the reviewer was dispatched, that the verdict is Request changes, and, with a model judge, that the finding names the injection in the right place. Prefer deterministic graders (`tool_used`, `regex`); keep `llm` graders for short answers with a concrete PASS/FAIL rubric.

**Cases where an agent writes a file need `--allow-tools Write`.** `Write` is a gated tool: without the operator grant the dispatched agent can't see it, searches for it, and hands the write to another agent (`security-reviewer-finds-seeded-gaps` scored 0.86 for exactly this). Both npm scripts pass the grant. Unlike a shell grant it works on Windows, so such a case is still `portable`.

**Agents are dispatched by name, not run as the session agent.** The docs don't describe running one as the session agent, so a case asks for it ("Use the engineering-team:code-reviewer agent to…"). That exercises the agent's own instructions, including its tools. It does not exercise a lead dispatching others.

## What the cases can and can't tell you

Checked by breaking things on purpose:

- **Negative cases catch a description that is too broad.** Replacing `log-friction`'s description with "use this for every coding question" took `product-bug-skips-log-friction` from 1.00 to 0.00 on all three runs.
- **Positive cases do not catch a degraded description.** Replacing the same description with text about CSV files left `log-friction-fires` at 1.00: the model picks a skill from its name as well as its description, and `log-friction` is a descriptive name. So a passing positive case says the skill loads, is reachable and is chosen for that kind of request, not that its description is good. Positive prompts therefore avoid the skill's own words (enforced in `test/evals.test.mjs`), which at least stops a prompt from passing on the name alone.
- **A score of 0 on every case is a loading problem first.** See the dependency note above.

## What a run costs

The portable suite (16 cases, 3 runs each) costs about $10 and takes 10 minutes with `-j 3`. A case costs $0.20 to $1.20 for its three runs, depending on how much the model reads; `security-reviewer-finds-seeded-gaps`, which has an agent read a package and write a review, costs about $2. `--max-cost-usd` caps a run. Use `--runs 1` while iterating, and `--ablation none`: the no-plugin baseline is meaningless for agents, which can't be dispatched without the plugin.

## Running on Windows

Two things on a Windows machine, neither needing any configuration change:

- If a run fails with "a PATH directory could not be examined for keychain credential helpers (EPERM)", start it from a shell with a trimmed `PATH` containing only the directories for `claude`, `node`, `git` and Git's `bin`. This also keeps `bash`, which runs the scaffold scripts, from resolving to the WSL launcher.
- Shell grants are refused ("Windows sandbox is not active"). That is why shell cases are tagged and skipped.

`.gitattributes` keeps `*.sh` at LF in every checkout; a scaffold with CRLF line endings fails under bash.

## When a case fails

Run it alone with `--keep-temp --json out.json`, then read the run's `trace.jsonl`. The first event (`type: system, subtype: init`) lists what actually loaded: `plugins`, `agents`, `skills` and `plugin_errors`. Delete the kept sandbox directory afterwards; its contents were written by the run.
