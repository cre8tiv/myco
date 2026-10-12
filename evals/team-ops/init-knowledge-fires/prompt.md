---
description: Asking to record documentation sources for the agent teams should fire init-knowledge.
tags: [skill-trigger, positive, team-ops, portable]
plugins: ["../../../plugins/team-ops"]
allowed_tools: [Read, Glob, Grep, Skill]
max_turns: 6
---
Our agent teams keep guessing at what the product supports. We have API reference docs at https://docs.example.com and an internal Confluence space. Record those as sources the teams should consult.
