const COLOR_MAP = {
    white: '#FFFFFF', black: '#000000', red: '#FF0000',
    green: '#00FF00', blue: '#0000FF', yellow: '#FFFF00',
    gray: '#808080', silver: '#C0C0C0', transparent: '#00000000'
};

const TAG_MAP = {
    div: 'LinearLayout', section: 'LinearLayout', header: 'LinearLayout',
    footer: 'LinearLayout', nav: 'LinearLayout', main: 'LinearLayout',
    article: 'LinearLayout', aside: 'LinearLayout', form: 'LinearLayout',
    ul: 'LinearLayout', ol: 'LinearLayout',
    h1: 'TextView', h2: 'TextView', h3: 'TextView', h4: 'TextView',
    p: 'TextView', span: 'TextView', label: 'TextView', a: 'TextView', li: 'TextView',
    strong: 'TextView', b: 'TextView', em: 'TextView', i: 'TextView',
    code: 'TextView', pre: 'TextView', kbd: 'TextView', cite: 'TextView', mark: 'TextView',
    small: 'TextView', u: 'TextView', s: 'TextView', del: 'TextView', ins: 'TextView',
    time: 'TextView', abbr: 'TextView', dfn: 'TextView', samp: 'TextView', var: 'TextView',
    blockquote: 'TextView', q: 'TextView', address: 'TextView', sup: 'TextView', sub: 'TextView',
    button: 'com.google.android.material.button.MaterialButton',
    input: 'EditText', textarea: 'EditText',
    img: 'ImageView',
    select: 'Spinner',
    progress: 'ProgressBar', meter: 'ProgressBar',
    hr: 'View',
    video: 'VideoView',
    iframe: 'WebView',
    fieldset: 'LinearLayout', legend: 'TextView',
    table: 'TableLayout', tr: 'TableRow', td: 'TextView', th: 'TextView', caption: 'TextView',
};

const INPUT_TYPE_MAP = {
    text: 'text',
    password: 'textPassword',
    email: 'textEmailAddress',
    number: 'number',
    tel: 'phone',
    url: 'textUri',
    search: 'text',
    date: 'date',
    time: 'time',
    'datetime-local': 'datetime',
    month: 'date',
    week: 'date',
    color: 'text',
};

const FONT_FAMILY_MAP = {
    arial: 'sans-serif', helvetica: 'sans-serif', verdana: 'sans-serif',
    'sans-serif': 'sans-serif', roboto: 'sans-serif', 'open sans': 'sans-serif',
    lato: 'sans-serif', ubuntu: 'sans-serif',
    georgia: 'serif', 'times new roman': 'serif', serif: 'serif',
    courier: 'monospace', 'courier new': 'monospace', monospace: 'monospace',
};

module.exports = { COLOR_MAP, TAG_MAP, INPUT_TYPE_MAP, FONT_FAMILY_MAP };
