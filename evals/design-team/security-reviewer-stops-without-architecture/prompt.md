---
description: With no architecture to threat-model, the security reviewer should say so and stop, not write a generic review.
tags: [agent, security-reviewer, design-team, portable]
plugins: ["../../../plugins/design-team", "../../../plugins/team-ops"]
allowed_tools: [Agent, Read, Glob, Grep, Write]
max_turns: 12
timeout_seconds: 600
---
Use the design-team:security-reviewer agent on the package at docs/design/order-export/ and have it write the security review. Tell me what it did and what it reported.
