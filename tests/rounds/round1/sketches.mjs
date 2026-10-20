/**
 * Round 1 sketches: what a person draws on a BLANK app to ask for each target.
 *
 * Hand-planned, page by page, the way a person would: which blocks get a mark
 * (box, button, heading squiggle, text squiggle, image X, circle) and the few
 * words they would type. The marks sit on the target's own measured boxes
 * (targets.json), so "same place as the target" is fair to ask of the build.
 * Words describe LOOK and content a picture can't carry (a gradient, a
 * typeface feel, the copy); they are counted and reported as the price of
 * each page.
 */
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
export const page = pageMaker(DIR)

export default [
  page('c1-sunset-hero', 'creative', 'Sunset gradient hero, huge serif headline, white pill button',
    // round-1 v2: a person draws the logo and links they want (not a bar box),
    // and says the page look as a whole-page note, not on a mark
    [['logo', 'text'], ['links', 'text'], ['headline', 'heading'], ['subhead', 'text'], ['cta', 'button']],
    [['*', 'whole page: warm sunset gradient coral to pink to purple, white text'],
     ['logo', 'italic serif logo "dusk."'],
     ['links', 'links: Work, Studio, Journal, Contact'],
     ['headline', 'huge elegant serif "Stay for the golden hour"'],
     ['cta', 'white pill button "Book a stay"']]),
  page('c2-brutalist-type', 'creative', 'Brutalist yellow poster page with giant uppercase type',
    [['nav', 'box'], ['headline', 'heading'], ['body', 'text'], ['cta', 'button']],
    [['nav', 'brutalist: bright yellow page, black heavy type, thick black rule under nav'],
     ['headline', 'giant uppercase "MAKE IT LOUD" two lines'],
     ['cta', 'black block button, yellow text, hard red offset shadow']]),
  page('c3-split-studio', 'creative', 'Split page: deep green text half, cream half with an orange orb',
    [['left-panel', 'box'], ['headline', 'heading'], ['body', 'text'], ['cta', 'box'], ['orb', 'circle']],
    [['left-panel', 'deep green panel, cream serif text "Plants that grow with you"'],
     ['orb', 'right half cream, big glowing orange sun orb']]),
  page('c4-neon-dark', 'creative', 'Neon dark hero on a grid, gradient headline, glowing buttons',
    [['nav', 'box'], ['badge', 'button'], ['headline', 'heading'], ['subhead', 'text'], ['ctas', 'box']],
    [['nav', 'near-black page with faint purple grid lines'],
     ['headline', '"Ship at the speed of light" cyan-purple-pink gradient text'],
     ['ctas', 'glowing purple button and cyan outline button']]),
  page('c5-editorial', 'creative', 'Editorial magazine page: masthead, giant red 01, essay, sidebar',
    [['masthead', 'box'], ['number', 'heading'], ['headline', 'heading'], ['dek', 'text'], ['sidebar', 'box']],
    [['masthead', 'magazine on warm paper, serif masthead "The Long Read", thin rule'],
     ['number', 'giant red serif "01"'],
     ['headline', 'essay title and italic dek']]),
  page('e1-login', 'everyday', 'Sign-in card: email, password, button, forgot link',
    [['card', 'box'], ['title', 'heading'], ['email', 'box'], ['password', 'box'], ['submit', 'button'], ['forgot', 'text']],
    [['title', 'sign in card'], ['submit', 'blue sign in button']]),
  page('e2-pricing', 'everyday', 'Pricing: title and three tiers, middle one highlighted dark',
    [['title', 'heading'], ['subtitle', 'text'], ['tier-1', 'box'], ['tier-2', 'box'], ['tier-3', 'box']],
    [['title', 'pricing: Starter $0, Pro $24, Team $79'], ['tier-2', 'popular, dark']]),
  page('e3-blog-list', 'everyday', 'Blog index: nav, title, three posts with thumbnails',
    [['nav', 'box'], ['title', 'heading'], ['thumb-1', 'image'], ['thumb-2', 'image'], ['thumb-3', 'image']],
    [['title', 'latest blog posts, each with title, excerpt and date']]),
  page('e4-contact', 'everyday', 'Contact page: form on the left, office info card on the right',
    [['title', 'heading'], ['name', 'box'], ['email', 'box'], ['message', 'box'], ['submit', 'button'], ['info', 'box']],
    [['title', 'contact form: name, email, message'], ['submit', 'green send button'], ['info', 'office address and email']]),
  page('e5-dashboard', 'everyday', 'Dashboard: dark sidebar, four stat cards, customers table',
    [['sidebar', 'box'], ['title', 'heading'], ['stat-1', 'box'], ['stat-2', 'box'], ['stat-3', 'box'], ['stat-4', 'box'], ['table', 'box']],
    [['sidebar', 'dark sidebar nav'], ['stats', 'stat cards: revenue, customers, churn, MRR'], ['table', 'customers table']]),
]
