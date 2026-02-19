/**
 * Instruction template builders for git actions.
 * These generate markdown strings sent to Claude CLI as user messages,
 * but rendered in the UI as compact file-attachment cards.
 */

export function buildCommitInstructions(gitState) {
  const { branch, uncommittedCount, stagedCount, unstagedCount, untrackedCount } = gitState;

  const lines = [
    `The user likes the current state of the code.`,
    `There are ${uncommittedCount} uncommitted change${uncommittedCount !== 1 ? 's' : ''}.`,
    `The current branch is \`${branch}\`.`,
  ];

  if (stagedCount > 0 || unstagedCount > 0 || untrackedCount > 0) {
    const parts = [];
    if (stagedCount > 0) parts.push(`${stagedCount} staged`);
    if (unstagedCount > 0) parts.push(`${unstagedCount} unstaged`);
    if (untrackedCount > 0) parts.push(`${untrackedCount} untracked`);
    lines.push(`Breakdown: ${parts.join(', ')}.`);
  }

  lines.push(
    `The user requested a commit.`,
    ``,
    `Follow these steps to commit:`,
    `1. Run \`git diff\` and \`git status\` to review the changes`,
    `2. Stage all relevant changes with \`git add\``,
    `3. Write a clear, concise commit message (conventional commits preferred)`,
    `4. Commit the changes`,
    `If any of these steps fail, ask the user for help.`
  );

  return lines.join('\n');
}

export function buildCreatePRInstructions(gitState, userPrefs = {}) {
  const {
    branch, defaultBranch, uncommittedCount, hasUpstream,
    unpushedCount, lastCommitSubject
  } = gitState;
  const { prTitle, prDescription } = userPrefs;

  const lines = [
    `The user likes the current state of the code.`,
  ];

  if (uncommittedCount > 0) {
    lines.push(`There are ${uncommittedCount} uncommitted change${uncommittedCount !== 1 ? 's' : ''}.`);
  }

  lines.push(`The current branch is \`${branch}\`.`);
  lines.push(`The target branch is \`origin/${defaultBranch}\`.`);

  if (!hasUpstream) {
    lines.push(`There is no upstream branch yet.`);
  } else if (unpushedCount > 0) {
    lines.push(`There are ${unpushedCount} unpushed commit${unpushedCount !== 1 ? 's' : ''}.`);
  }

  if (lastCommitSubject) {
    lines.push(`Last commit: "${lastCommitSubject}".`);
  }

  lines.push(`The user requested a PR.`);
  lines.push(``);
  lines.push(`Follow these steps to create a PR:`);

  let step = 1;
  if (uncommittedCount > 0) {
    lines.push(`${step}. Run \`git diff\` to review uncommitted changes`);
    step++;
    lines.push(`${step}. Commit them with a descriptive message`);
    step++;
  }

  lines.push(`${step}. Push to origin: \`git push -u origin ${branch}\``);
  step++;

  if (prTitle && prDescription) {
    lines.push(`${step}. Create the PR: \`gh pr create --base ${defaultBranch} --title "${prTitle}" --body "${prDescription}"\``);
  } else if (prTitle) {
    lines.push(`${step}. Create the PR: \`gh pr create --base ${defaultBranch} --title "${prTitle}"\``);
    lines.push(`   - Keep the description under 5 sentences describing all changes in the branch`);
  } else {
    lines.push(`${step}. Use \`gh pr create --base ${defaultBranch}\``);
    lines.push(`   - Keep title under 80 characters`);
    lines.push(`   - Keep description under 5 sentences`);
    lines.push(`   - Describe all changes in the branch, not just the current session`);
  }

  lines.push(`If any of these steps fail, ask the user for help.`);

  return lines.join('\n');
}

export function buildMergePRInstructions(gitState) {
  const { openPR } = gitState;

  const lines = [
    `The user wants to merge PR #${openPR.number}: "${openPR.title}".`,
    ``,
    `Run \`gh pr merge ${openPR.number} --squash\` to merge the pull request.`,
    ``,
    `If any step fails, ask the user for help.`
  ];

  return lines.join('\n');
}
