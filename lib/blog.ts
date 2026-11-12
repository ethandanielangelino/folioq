// Blog posts live here as plain data. To publish a new one, add an entry to
// the top of `posts`; the index and the post page pick it up automatically.

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'example'; rows: [string, string][]; caption?: string }

export interface Post {
  slug: string
  title: string
  summary: string
  /** YYYY-MM-DD */
  date: string
  minutes: number
  body: Block[]
}

export const posts: Post[] = [
  {
    slug: 'write-the-thesis-down',
    title: 'Write the thesis down before the price moves',
    summary:
      'A thesis takes a few minutes to write and is the only honest record of what you were thinking. Here is what makes one worth reading later.',
    date: '2026-11-11',
    minutes: 4,
    body: [
      {
        type: 'p',
        text: 'Ask someone why they bought a stock a year ago and you will get a tidy answer. If the stock went up, the answer is a thesis. If it went down, the answer is bad luck. Neither is necessarily what they were thinking on the day, because memory quietly rewrites reasons to fit results.',
      },
      {
        type: 'p',
        text: 'That is a small problem when the money is yours. It is a real one when you manage money for a club, a fund, or a family member, because sooner or later someone will ask, and “I don’t remember” is the worst available answer.',
      },
      { type: 'h2', text: 'Three parts' },
      {
        type: 'p',
        text: 'A useful thesis is short. It does not need to be a research report. It needs to be specific enough that a stranger could later tell whether you were right for the reasons you gave. FolioQ splits it into three parts.',
      },
      {
        type: 'list',
        items: [
          'The claim: why this position belongs in this portfolio. “Margins recover as freight costs fall” is a claim. “Good company” is not.',
          'The assumptions: what has to stay true for the claim to hold. Each one should be something you could check against a quarterly report.',
          'The risks: the specific ways this goes wrong, including the size of the position itself.',
        ],
      },
      { type: 'h2', text: 'Assumptions are the part people skip' },
      {
        type: 'p',
        text: 'Most people can state a claim and wave at some risks. The assumptions are harder, and they are where the value is. An assumption like “cloud revenue keeps growing faster than 15% a year” gives you a tripwire. When a quarter comes in at 11%, you don’t have to decide how you feel about the stock. You have to decide whether your own stated condition has broken.',
      },
      { type: 'h2', text: 'Change it in the open' },
      {
        type: 'p',
        text: 'Theses should change. Facts change, and a manager who never updates is not paying attention. What matters is that the change is visible. In FolioQ every edit is saved as a new version, and the earlier ones stay attached to the holding. Anyone reading can see what you believed in February and what you believe now.',
      },
      { type: 'h2', text: 'Reading them back' },
      {
        type: 'p',
        text: 'The payoff comes later. Once a quarter, read each thesis against what actually happened. You are not grading outcomes; a good decision can lose money. You are checking whether the reasons you gave were the reasons that mattered. Over a year, that is the most direct feedback on your judgment you will ever get.',
      },
    ],
  },
  {
    slug: 'ai-drafts-and-your-reasoning',
    title: 'An AI draft is not your reasoning',
    summary:
      'FolioQ can draft a thesis for you. Here is how to use that without fooling yourself or the people you report to.',
    date: '2026-11-11',
    minutes: 3,
    body: [
      {
        type: 'p',
        text: 'A blank “why do you own this?” box is intimidating, so FolioQ offers a way past it: ask for an AI draft. The model is given the company, its industry, your portfolio’s mandate, the size of your position, and the past week’s headlines, and it writes a claim with a few assumptions and risks.',
      },
      {
        type: 'p',
        text: 'This is useful in the way an outline is useful. It is also dangerous in a specific way: the draft will sound reasonable whether or not it has anything to do with why you bought.',
      },
      { type: 'h2', text: 'What the draft is good for' },
      {
        type: 'list',
        items: [
          'Getting past the blank page.',
          'Reminding you of the standard risks for a business you know less well than you thought.',
          'Showing you the shape: a claim someone could disagree with, assumptions someone could check.',
        ],
      },
      { type: 'h2', text: 'What it is not' },
      {
        type: 'p',
        text: 'It is not a record of your thinking, because it wasn’t there when you made the decision. It doesn’t know about the conversation in the club meeting, the comparison you ran against a competitor, or the fact that you mainly wanted less exposure to something else. And like any language model, it can state things that are simply wrong.',
      },
      { type: 'h2', text: 'How FolioQ keeps the two apart' },
      {
        type: 'p',
        text: 'Every thesis carries a marker for whether its author changed it. If you save a draft exactly as the AI wrote it, the thesis is labelled “AI draft, saved without changes” everywhere it appears, including on the read-only page you share with others. Edit it, and it is labelled as written by the owner.',
      },
      {
        type: 'p',
        text: 'The label is there for the reader. Someone looking at your portfolio is entitled to know whether a paragraph is your reasoning or a machine’s first guess at what your reasoning might be.',
      },
      { type: 'h2', text: 'A practical routine' },
      {
        type: 'list',
        items: [
          'Draft it.',
          'Delete every sentence you wouldn’t defend out loud.',
          'Replace each generic assumption with a number or an event you can check.',
          'Add the risk that is particular to you: how big the position is, and what else in the portfolio moves with it.',
        ],
      },
    ],
  },
  {
    slug: 'how-the-numbers-work',
    title: 'How FolioQ works out your numbers',
    summary:
      'Value, weight, gain, today’s change, and the history chart: the arithmetic behind a portfolio page, with a worked example and the limits spelled out.',
    date: '2026-11-11',
    minutes: 4,
    body: [
      {
        type: 'p',
        text: 'A FolioQ holding is three things you enter: a ticker, a share count, and your average cost per share. Everything else on the page is calculated from those and a live price. This post walks through the arithmetic.',
      },
      { type: 'h2', text: 'One holding' },
      {
        type: 'example',
        rows: [
          ['You enter', '15 shares, average cost $200.00'],
          ['Live price', '$230.00, up $2.00 today'],
          ['Value', '15 × $230.00 = $3,450.00'],
          ['Cost', '15 × $200.00 = $3,000.00'],
          ['Gain', '$3,450.00 − $3,000.00 = +$450.00, or +15.00% of cost'],
          ['Today', '15 × $2.00 = +$30.00'],
        ],
      },
      { type: 'h2', text: 'The whole portfolio' },
      {
        type: 'p',
        text: 'Market value is the sum of every holding’s value. A holding’s weight is its value divided by that total. Gain adds up the holdings that have both a price and a cost, and the percentage compares that to their combined cost. “Today” adds up each holding’s move since the previous close and compares it to what the portfolio was worth then.',
      },
      { type: 'h2', text: 'When you buy more or sell some' },
      {
        type: 'p',
        text: 'FolioQ tracks positions, not individual trades. After buying more, edit the holding: raise the share count and update the average cost to your new blended figure (total paid divided by total shares). After selling some, lower the share count; the average cost of what remains doesn’t change. Sell everything, and you delete the holding.',
      },
      { type: 'h2', text: 'The history chart' },
      {
        type: 'p',
        text: 'Each weekday evening FolioQ saves the closing price of every ticker held by anyone. The chart multiplies those closes by your current share counts, counting each holding from the date you opened it, and plots the total next to the cost of those positions.',
      },
      {
        type: 'p',
        text: 'Two things follow from that. The chart shows what today’s positions were worth over time, so changing a share count restates the whole line rather than adding a step on the day you traded. And history only starts when a ticker is first held, because that is when its prices start being saved.',
      },
      { type: 'h2', text: 'What is left out' },
      {
        type: 'list',
        items: [
          'Gains already taken by selling are not tracked once the shares are gone.',
          'Dividends, interest, fees, and cash are not recorded.',
          'A holding with no cost entered has a value and a weight but is left out of gain. The page tells you which ones.',
          'If a live price is unavailable, the holding is counted at cost and the page says so.',
        ],
      },
    ],
  },
  {
    slug: 'share-without-sharing-your-login',
    title: 'Show the portfolio without sharing your login',
    summary:
      'How read-only links work, what the people you share with can and can’t see, and how to take access back.',
    date: '2026-11-11',
    minutes: 3,
    body: [
      {
        type: 'p',
        text: 'The quickest way to show someone a portfolio is to hand them your password. It is also the worst: they can change things, you can’t tell who did what, and you can’t take access back without locking yourself into a password reset.',
      },
      {
        type: 'p',
        text: 'FolioQ’s answer is a share link: a private address for one portfolio that shows everything and changes nothing.',
      },
      { type: 'h2', text: 'Turning it on' },
      {
        type: 'p',
        text: 'Open a portfolio, choose Share, and create the link. Copy it and send it however you normally reach people: email, a group chat, the club’s shared drive.',
      },
      { type: 'h2', text: 'What the other person sees' },
      {
        type: 'list',
        items: [
          'The portfolio’s name and mandate.',
          'Current value, gain, and today’s change, with live prices.',
          'Every holding and its weight, by holding and by sector.',
          'The value history chart.',
          'The thesis for each holding, with earlier versions, and a label on any that is an unedited AI draft.',
        ],
      },
      {
        type: 'p',
        text: 'They do not see your email address, your other portfolios, or your conversation with the assistant. They have no buttons that change anything, and they do not need an account.',
      },
      { type: 'h2', text: 'Who can open it' },
      {
        type: 'p',
        text: 'Anyone who has the link. It is long and random, so it can’t be guessed, and shared pages ask search engines not to index them. But a link can be forwarded, so treat it the way you would treat the document it replaces: send it to the people who should have it.',
      },
      { type: 'h2', text: 'Taking it back' },
      {
        type: 'p',
        text: 'Turn sharing off and the link stops working immediately, for everyone. If you turn sharing on again, FolioQ issues a brand new link; the old one stays dead. That makes “rotate the link” a two-click job when someone leaves the club.',
      },
    ],
  },
]

export function getPost(slug: string): Post | undefined {
  return posts.find((post) => post.slug === slug)
}
