---
description: Opening a pull request for a structural change should fire the pr-lens skill.
tags: [skill-trigger, positive, engineering-team, portable]
plugins: ["../../../plugins/engineering-team", "../../../plugins/team-ops"]
allowed_tools: [Read, Glob, Grep, Skill]
max_turns: 6
---
I've finished a change that moves the signup route onto a queue, and I'm about to open the pull request. Add a picture of what the change touches — and what it sits next to — to the request description, so a reviewer sees the shape of it before the diff.
