const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ShiftLayout = require('..');
const {
    parseStyle, parseStyleDeclarations, parseCssStylesheet, normalizeMediaProfile, matchesMediaQuery, selectorSpecificity,
    parseBorder, parseBorderRadius, parseBoxShadow, buildXmlString,
    evaluateCssLength, pxToDp, pxToSp,
    resourceNameFromPath, sanitizeColor, extractBackgroundColor,
} = require('../src/utils');

assert.equal(typeof ShiftLayout, 'function');
assert.deepEqual(parseStyleDeclarations('color: red !important; width: 10px'), [
    { property: 'color', value: 'red', important: true },
    { property: 'width', value: '10px', important: false },
]);
assert.equal(parseCssStylesheet('p, .note { color: red; }').length, 1);
assert.deepEqual(selectorSpecificity('#screen .note p'), [1, 1, 1]);

const converter = new ShiftLayout({ prefix: 'test' });
const { layout, menus } = converter.convert(`
    <main>
        <h1 title="ignored">Save & Continue "now"</h1>
        <img src="icons/user-avatar.png" alt="User <avatar> & profile">
        <nav id="tabs">
            <a>Home & Work</a>
            <a>Plans "A"</a>
        </nav>
    </main>
`);

assert.match(layout, /android:text="Save &amp; Continue &quot;now&quot;"/);
assert.match(layout, /android:contentDescription="User &lt;avatar&gt; &amp; profile"/);
assert.ok(!layout.includes('android:text="Save & Continue'));

assert.match(menus['tabs_menu.xml'], /android:title="Home &amp; Work"/);
assert.match(menus['tabs_menu.xml'], /android:title="Plans &quot;A&quot;"/);

const improved = new ShiftLayout({ prefix: 'sl' }).convert(`
    <section id="123 Hero" style="width: 320px; height: 180px; display: None; opacity: 2;">
        <p style="font-weight: Bold; text-align: CENTER; white-space: NoWrap;">Status</p>
        <input type="submit" id="99-send" value="Send request" style="width: 120px;">
        <img src="assets/123 avatar.png">
    </section>
`);

assert.match(improved.layout, /android:id="@\+id\/sl_123_hero"/);
assert.match(improved.layout, /android:layout_width="320dp"/);
assert.match(improved.layout, /android:layout_height="180dp"/);
assert.match(improved.layout, /android:visibility="gone"/);
assert.match(improved.layout, /android:alpha="1.00"/);
assert.match(improved.layout, /android:textStyle="bold"/);
assert.match(improved.layout, /android:gravity="center"/);
assert.match(improved.layout, /android:maxLines="1"/);
assert.match(improved.layout, /android:id="@\+id\/sl_99_send"/);
assert.match(improved.layout, /android:text="Send request"/);
assert.match(improved.layout, /android:src="@drawable\/placeholder_123_avatar"/);

const parsedStyles = parseStyle('background-image: url("data:image/svg+xml;utf8,<svg></svg>"); padding: 8px 12px;');
assert.equal(parsedStyles['background-image'], 'url("data:image/svg+xml;utf8,<svg></svg>")');
assert.equal(parsedStyles.padding, '8px 12px');
assert.equal(parseStyle('display: none !important; color: red!important;').display, 'none');
assert.equal(parseStyle('display: none !important; color: red!important;').color, 'red');
assert.deepEqual(parseStyle('/* ignore: this; */ color: blue; padding: 4px;'), { color: 'blue', padding: '4px' });
assert.equal(buildXmlString('View', { 'android:id': '@+id/ok', 'android:elevation': null, 'android:text': undefined }), '<View\n    android:id="@+id/ok" />');
assert.equal(pxToDp('1.5rem'), '24dp');
assert.equal(pxToDp('0.25em'), '4dp');
assert.equal(pxToSp('1.25rem'), '20sp');
assert.equal(evaluateCssLength('calc(10px + 1rem)'), '26dp');
assert.equal(evaluateCssLength('calc((20px + 4px) / 2)'), '12dp');
assert.equal(evaluateCssLength('calc(2 * 8px)'), '16dp');
assert.equal(evaluateCssLength('min(40px, 3rem)'), '40dp');
assert.equal(evaluateCssLength('max(40px, 3rem)'), '48dp');
assert.equal(evaluateCssLength('clamp(12px, 2rem, 40px)'), '32dp');
assert.equal(evaluateCssLength('calc(100% - 16px)'), null);
assert.equal(evaluateCssLength('calc(10px * 2px)'), null);
assert.equal(evaluateCssLength('calc(10px / 0)'), null);
const portraitMedia = normalizeMediaProfile({ width: '37.5rem', height: 800 });
assert.deepEqual(portraitMedia, { type: 'screen', width: 600, height: 800, orientation: 'portrait' });
assert.equal(matchesMediaQuery('screen and (min-width: 600px) and (orientation: portrait)', portraitMedia), true);
assert.equal(matchesMediaQuery('(max-width: 599px), print', portraitMedia), false);
assert.equal(matchesMediaQuery('not print', portraitMedia), true);
assert.throws(() => normalizeMediaProfile({ width: '50vw' }), /media\.width/);
assert.throws(() => normalizeMediaProfile({ orientation: 'square' }), /media\.orientation/);

const spacing = new ShiftLayout().convert(`
    <div id="spacing" style="padding: 0.5rem 0.75rem; margin: 4px 6px 8px 10px;">
        <span style="margin-top: 14px; padding-left: 1em; font-size: 1.25rem;">Box</span>
        <span id="important_hidden" style="display: none !important;">Hidden</span>
    </div>
`);

assert.match(spacing.layout, /android:paddingTop="8dp"/);
assert.match(spacing.layout, /android:paddingRight="12dp"/);
assert.match(spacing.layout, /android:paddingBottom="8dp"/);
assert.match(spacing.layout, /android:paddingLeft="12dp"/);
assert.match(spacing.layout, /android:layout_marginTop="4dp"/);
assert.match(spacing.layout, /android:layout_marginRight="6dp"/);
assert.match(spacing.layout, /android:layout_marginBottom="8dp"/);
assert.match(spacing.layout, /android:layout_marginLeft="10dp"/);
assert.match(spacing.layout, /android:layout_marginTop="14dp"/);
assert.match(spacing.layout, /android:paddingLeft="16dp"/);
assert.match(spacing.layout, /android:textSize="20sp"/);
assert.match(spacing.layout, /android:id="@\+id\/important_hidden"[\s\S]*android:visibility="gone"/);

const forms = new ShiftLayout().convert(`
    <form>
        <input id="email" type="email" name="email_address" placeholder="Email" autocomplete="email" style="width: 240px; height: 56px;" disabled required>
        <input id="email" type="text" value="Duplicate id">
        <textarea id="bio" readonly>About & details</textarea>
        <input id="agree" type="checkbox" value="terms & privacy" checked disabled>
        <input id="choice" type="radio" value="pro" checked>
        <input id="search_field" type="search" aria-label="Search members">
        <input id="amount" type="text" inputmode="decimal" enterkeyhint="done">
        <input id="recipient" type="text" autocapitalize="words" spellcheck="false" enterkeyhint="send">
        <input id="meeting" type="datetime-local">
        <input id="billing_month" type="month">
        <input id="billing_week" type="week">
        <input id="brand_color" type="color" value="#336699">
        <textarea id="notes" title="Internal notes" rows="5" cols="42" autofocus></textarea>
    </form>
`);

assert.match(forms.layout, /android:id="@\+id\/email"/);
assert.match(forms.layout, /android:id="@\+id\/email_2"/);
assert.match(forms.layout, /android:layout_width="240dp"/);
assert.match(forms.layout, /android:layout_height="56dp"/);
assert.match(forms.layout, /android:inputType="textEmailAddress"/);
assert.match(forms.layout, /android:enabled="false"/);
assert.match(forms.layout, /android:focusable="false"/);
assert.match(forms.layout, /android:checked="true"/);
assert.match(forms.layout, /android:id="@\+id\/agree"[\s\S]*android:tag="terms &amp; privacy"/);
assert.match(forms.layout, /android:id="@\+id\/choice"[\s\S]*android:tag="pro"/);
assert.match(forms.layout, /android:importantForAutofill="yes"/);
assert.match(forms.layout, /android:autofillHints="email"/);
assert.match(forms.layout, /android:text="About &amp; details"/);
assert.match(forms.layout, /android:id="@\+id\/search_field"[\s\S]*android:hint="Search members"/);
assert.match(forms.layout, /android:id="@\+id\/search_field"[\s\S]*android:contentDescription="Search members"/);
assert.match(forms.layout, /android:id="@\+id\/amount"[\s\S]*android:inputType="numberDecimal"/);
assert.match(forms.layout, /android:id="@\+id\/amount"[\s\S]*android:imeOptions="actionDone"/);
assert.match(forms.layout, /android:id="@\+id\/recipient"[\s\S]*android:inputType="text\|textNoSuggestions\|textCapWords"/);
assert.match(forms.layout, /android:id="@\+id\/recipient"[\s\S]*android:imeOptions="actionSend"/);
assert.match(forms.layout, /android:id="@\+id\/meeting"[\s\S]*android:inputType="datetime"/);
assert.match(forms.layout, /android:id="@\+id\/billing_month"[\s\S]*android:inputType="date"/);
assert.match(forms.layout, /android:id="@\+id\/billing_week"[\s\S]*android:inputType="date"/);
assert.match(forms.layout, /android:id="@\+id\/brand_color"[\s\S]*android:inputType="text"/);
assert.match(forms.layout, /android:id="@\+id\/brand_color"[\s\S]*android:autofillHints="color"/);
assert.match(forms.layout, /android:id="@\+id\/notes"[\s\S]*android:hint="Internal notes"/);
assert.match(forms.layout, /android:id="@\+id\/notes"[\s\S]*android:minLines="5"/);
assert.match(forms.layout, /android:id="@\+id\/notes"[\s\S]*android:ems="42"/);
assert.match(forms.layout, /android:id="@\+id\/notes"[\s\S]*<requestFocus \/>/);

assert.equal(sanitizeColor('rgb(300, -1, 12)'), null);
assert.equal(sanitizeColor('rgb(300, 0, 12)'), '#FF000C');
assert.equal(sanitizeColor('rgba(10, 20, 30, 2)'), '#FF0A141E');
assert.equal(sanitizeColor('hsl(210, 50%, 40%)'), '#336699');
assert.equal(sanitizeColor('hsla(120, 100%, 25%, 0.5)'), '#80008000');
assert.equal(sanitizeColor('hsl(-30, 100%, 50%)'), '#FF0080');
assert.equal(sanitizeColor('var(--brand-color, hsl(210, 50%, 40%))'), '#336699');
assert.equal(sanitizeColor('#0f08'), '#8800FF00');
assert.equal(sanitizeColor('#336699cc'), '#CC336699');
assert.equal(sanitizeColor('#nothex'), null);
assert.equal(extractBackgroundColor('white url(hero.png) center / cover no-repeat'), '#FFFFFF');
assert.equal(extractBackgroundColor('url(hero.png) no-repeat #123456'), '#123456');
assert.equal(extractBackgroundColor('center / cover rgba(1, 2, 3, 0.5)'), '#80010203');

assert.deepEqual(parseBorder('1px solid rgba(0, 0, 0, 0.2)'), {
    width: '1dp',
    style: 'solid',
    color: '#33000000',
});
assert.deepEqual(parseBorder('none'), {});
assert.equal(parseBoxShadow('none'), null);
assert.equal(parseBoxShadow('inset 0 2px 8px rgba(0,0,0,.2)'), null);
assert.equal(parseBoxShadow('0 -2px 8px rgba(0,0,0,.2)'), '8dp');

const borders = new ShiftLayout().convert(`
    <div id="outlined" style="border: 2px solid rgba(10, 20, 30, 0.25); border-radius: 8px;">Panel</div>
    <div id="plain" style="border: none; border-radius: 8px;">Plain</div>
    <div id="shorthand_bg" style="background: white url(hero.png) center / cover no-repeat;">Shorthand</div>
    <div id="rgba_bg" style="background: center / cover rgba(1, 2, 3, 0.5);">Tint</div>
    <div id="hsl_bg" style="background-color: hsl(210, 50%, 40%); color: hsla(120, 100%, 25%, 0.5);">HSL</div>
    <div id="outlined_focus" style="outline: 3px solid #ff00ff; border-radius: 6px;">Focus</div>
    <div id="left_border" style="border-left: 4px solid #123456; border-radius: 2px;">Side</div>
`);

assert.match(borders.layout, /android:background="@drawable\/sl_bg_transparent_r8_s400a141e2"/);
assert.match(borders.drawables['sl_bg_transparent_r8_s400a141e2.xml'], /<stroke android:width="2dp" android:color="#400A141E" \/>/);
assert.match(borders.layout, /android:background="@drawable\/sl_bg_transparent_r8"/);
assert.ok(!borders.drawables['sl_bg_transparent_r8.xml'].includes('<stroke'));
assert.match(borders.layout, /android:id="@\+id\/shorthand_bg"[\s\S]*android:background="#FFFFFF"/);
assert.match(borders.layout, /android:id="@\+id\/rgba_bg"[\s\S]*android:background="#80010203"/);
assert.match(borders.layout, /android:id="@\+id\/hsl_bg"[\s\S]*android:textColor="#80008000"/);
assert.match(borders.layout, /android:id="@\+id\/hsl_bg"[\s\S]*android:background="#336699"/);
assert.match(borders.layout, /android:id="@\+id\/outlined_focus"[\s\S]*android:background="@drawable\/sl_bg_transparent_r6_sff00ff3"/);
assert.match(borders.drawables['sl_bg_transparent_r6_sff00ff3.xml'], /<stroke android:width="3dp" android:color="#FF00FF" \/>/);
assert.match(borders.layout, /android:id="@\+id\/left_border"[\s\S]*android:background="@drawable\/sl_bg_transparent_r2_s1234564"/);
assert.match(borders.drawables['sl_bg_transparent_r2_s1234564.xml'], /<stroke android:width="4dp" android:color="#123456" \/>/);

assert.deepEqual(parseBorderRadius('4px 8px 12px 16px'), {
    topLeft: '4dp',
    topRight: '8dp',
    bottomRight: '12dp',
    bottomLeft: '16dp',
});

const radii = new ShiftLayout().convert(`
    <div id="rounded" style="background-color: #ffffff; border-radius: 4px 8px 12px 16px;">Rounded</div>
    <div id="grad_a" style="background: linear-gradient(to right, #111111, #222222); border-radius: 4px;">A</div>
    <div id="grad_b" style="background: linear-gradient(to right, #111111, #222222); border-radius: 12px;">B</div>
    <div id="grad_image" style="background-image: linear-gradient(to bottom, hsl(210, 50%, 40%), hsla(120, 100%, 25%, 0.5));">C</div>
`);

assert.match(radii.drawables['sl_bg_ffffff_r4_8_12_16.xml'], /android:topLeftRadius="4dp"/);
assert.match(radii.drawables['sl_bg_ffffff_r4_8_12_16.xml'], /android:topRightRadius="8dp"/);
assert.match(radii.drawables['sl_bg_ffffff_r4_8_12_16.xml'], /android:bottomRightRadius="12dp"/);
assert.match(radii.drawables['sl_bg_ffffff_r4_8_12_16.xml'], /android:bottomLeftRadius="16dp"/);
assert.ok(radii.drawables['sl_grad_111111_222222_a0_r4.xml']);
assert.ok(radii.drawables['sl_grad_111111_222222_a0_r12.xml']);
assert.match(radii.layout, /android:id="@\+id\/grad_image"[\s\S]*android:background="@drawable\/sl_grad_336699_80008000_a270_r0"/);
assert.match(radii.drawables['sl_grad_336699_80008000_a270_r0.xml'], /android:startColor="#336699"/);
assert.match(radii.drawables['sl_grad_336699_80008000_a270_r0.xml'], /android:endColor="#80008000"/);

const layoutDecisions = new ShiftLayout().convert(`
    <div id="frame" style="width: 100%; height: 100%;">
        <span id="badge" style="position: Absolute; right: 8px; bottom: 12px;">New</span>
    </div>
    <section id="scrolling" style="overflow-y: Auto;">
        <p>Scrollable</p>
    </section>
    <div id="card" style="border-radius: 12px; box-shadow: 0 2px 6px #000; flex-direction: Row;">
        <span>A</span>
    </div>
    <div id="flat_shadow" style="box-shadow: none;">Flat</div>
    <div id="inner_shadow" style="box-shadow: inset 0 2px 8px rgba(0,0,0,.2);">Inner</div>
    <div id="gapped" style="display: flex; flex-direction: row; gap: 12px;">
        <span>A</span><span>B</span>
    </div>
    <button id="round_button" style="border-radius: 4px 8px;">Go</button>
`);

assert.match(layoutDecisions.layout, /<FrameLayout/);
assert.match(layoutDecisions.layout, /android:layout_gravity="end\|bottom"/);
assert.match(layoutDecisions.layout, /<ScrollView/);
assert.match(layoutDecisions.layout, /app:cardCornerRadius="12dp"/);
assert.doesNotMatch(layoutDecisions.layout, /android:id="@\+id\/flat_shadow"[\s\S]*android:elevation=/);
assert.doesNotMatch(layoutDecisions.layout, /android:id="@\+id\/inner_shadow"[\s\S]*android:elevation=/);
assert.match(layoutDecisions.layout, /android:orientation="horizontal"/);
assert.match(layoutDecisions.layout, /android:id="@\+id\/gapped"[\s\S]*android:dividerPadding="12dp"/);
assert.match(layoutDecisions.layout, /android:id="@\+id\/gapped"[\s\S]*android:showDividers="middle"/);
assert.match(layoutDecisions.layout, /app:cornerRadius="4dp"/);

const flexLayouts = new ShiftLayout().convert(`
    <div id="basic_flex" style="display: flex; justify-content: center;">
        <span>Basic</span>
    </div>
    <div id="advanced_flex" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; align-content: space-around;">
        <span id="third" style="order: 3; flex: 2 0 40%; align-self: flex-end;">Third</span>
        <span id="first" style="order: 1; flex-basis: 120px;">First</span>
        <input id="second" style="order: 2; flex-grow: 1; flex-shrink: 0;" placeholder="Second">
    </div>
    <div id="column_flex" style="display: flex; flex-direction: column;">
        <span id="column_item" style="flex-basis: 64px;">Column item</span>
    </div>
    <div id="reverse_flex" style="display: flex; flex-direction: row-reverse;">
        <span>Reverse</span>
    </div>
`);

const basicFlexOpenTag = flexLayouts.layout.match(/<LinearLayout\b[^>]*android:id="@\+id\/basic_flex"[^>]*>/)[0];
assert.match(basicFlexOpenTag, /android:orientation="horizontal"/);
assert.match(basicFlexOpenTag, /android:gravity="center_horizontal"/);
assert.match(flexLayouts.layout, /<com\.google\.android\.flexbox\.FlexboxLayout[\s\S]*android:id="@\+id\/advanced_flex"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/advanced_flex"[\s\S]*app:flexWrap="wrap"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/advanced_flex"[\s\S]*app:justifyContent="space_between"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/advanced_flex"[\s\S]*app:alignItems="center"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/advanced_flex"[\s\S]*app:alignContent="space_around"/);
assert.ok(flexLayouts.layout.indexOf('@+id/first') < flexLayouts.layout.indexOf('@+id/second'));
assert.ok(flexLayouts.layout.indexOf('@+id/second') < flexLayouts.layout.indexOf('@+id/third'));
assert.match(flexLayouts.layout, /android:id="@\+id\/third"[\s\S]*app:layout_order="4"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/third"[\s\S]*app:layout_flexGrow="2"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/third"[\s\S]*app:layout_flexShrink="0"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/third"[\s\S]*app:layout_flexBasisPercent="40%"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/third"[\s\S]*app:layout_alignSelf="flex_end"/);
const firstFlexItem = flexLayouts.layout.match(/<TextView\b[^>]*android:id="@\+id\/first"[^>]*\/>/)[0];
assert.match(firstFlexItem, /android:layout_width="120dp"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/second"[\s\S]*app:layout_order="3"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/second"[\s\S]*app:layout_flexGrow="1"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/column_flex"[\s\S]*app:flexDirection="column"/);
const columnFlexItem = flexLayouts.layout.match(/<TextView\b[^>]*android:id="@\+id\/column_item"[^>]*\/>/)[0];
assert.match(columnFlexItem, /android:layout_height="64dp"/);
assert.match(flexLayouts.layout, /android:id="@\+id\/reverse_flex"[\s\S]*app:flexDirection="row_reverse"/);

const gridLayouts = new ShiftLayout().convert(`
    <div id="dashboard_grid" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: auto 1fr; grid-auto-flow: column; gap: 12px 20px; place-items: center stretch;">
        <span id="grid_last" style="order: 2; grid-column: 2 / span 2; grid-row: 1 / 3; justify-self: end; align-self: start;">Last</span>
        <span id="grid_first" style="order: -1; grid-area: 2 / 1 / 3 / 3;">First</span>
        <input id="grid_input" style="grid-column: 1 / 2;" placeholder="Grid input">
    </div>
    <section id="four_columns" style="display: grid; grid-template-columns: repeat(2, 1fr 2fr);">
        <span>Track count</span>
    </section>
`);

const dashboardGridOpenTag = gridLayouts.layout.match(/<GridLayout\b[^>]*android:id="@\+id\/dashboard_grid"[^>]*>/)[0];
assert.match(dashboardGridOpenTag, /android:columnCount="3"/);
assert.match(dashboardGridOpenTag, /android:rowCount="2"/);
assert.match(dashboardGridOpenTag, /android:orientation="vertical"/);
assert.match(dashboardGridOpenTag, /android:alignmentMode="alignMargins"/);
assert.ok(gridLayouts.layout.indexOf('@+id/grid_first') < gridLayouts.layout.indexOf('@+id/grid_input'));
assert.ok(gridLayouts.layout.indexOf('@+id/grid_input') < gridLayouts.layout.indexOf('@+id/grid_last'));
const gridLastView = gridLayouts.layout.match(/<TextView\b[^>]*android:id="@\+id\/grid_last"[^>]*\/>/)[0];
assert.match(gridLastView, /android:layout_column="1"/);
assert.match(gridLastView, /android:layout_columnSpan="2"/);
assert.match(gridLastView, /android:layout_row="0"/);
assert.match(gridLastView, /android:layout_rowSpan="2"/);
assert.match(gridLastView, /android:layout_columnWeight="1"/);
assert.match(gridLastView, /android:layout_rowWeight="1"/);
assert.match(gridLastView, /android:layout_gravity="end\|top"/);
assert.match(gridLastView, /android:layout_marginTop="6dp"/);
assert.match(gridLastView, /android:layout_marginBottom="6dp"/);
assert.match(gridLastView, /android:layout_marginLeft="10dp"/);
assert.match(gridLastView, /android:layout_marginRight="10dp"/);
const gridFirstView = gridLayouts.layout.match(/<TextView\b[^>]*android:id="@\+id\/grid_first"[^>]*\/>/)[0];
assert.match(gridFirstView, /android:layout_column="0"/);
assert.match(gridFirstView, /android:layout_columnSpan="2"/);
assert.match(gridFirstView, /android:layout_row="1"/);
assert.match(gridFirstView, /android:layout_rowSpan="1"/);
assert.match(gridFirstView, /android:layout_gravity="fill_horizontal\|center_vertical"/);
assert.match(gridLayouts.layout, /android:id="@\+id\/grid_input"[\s\S]*android:layout_column="0"/);
const fourColumnsOpenTag = gridLayouts.layout.match(/<GridLayout\b[^>]*android:id="@\+id\/four_columns"[^>]*>/)[0];
assert.match(fourColumnsOpenTag, /android:columnCount="4"/);

const positioning = new ShiftLayout().convert(`
    <div id="fixed_overlay" style="position: fixed; inset: 16px 24px 32px 40px;"></div>
    <div id="positioning_parent" style="position: relative; width: 300px; height: 200px;">
        <span id="fill_parent" style="position: absolute; inset: 0;">Fill</span>
        <span id="bottom_end" style="position: absolute; right: 12px; bottom: 20px; width: 80px;">End</span>
        <span id="relative_offset" style="position: relative; left: 10px; bottom: 4px;">Relative</span>
        <span id="auto_center" style="width: 100px; margin: 0 auto;">Centered</span>
        <span id="absolute_center" style="position: absolute; inset: 0; width: 80px; height: 40px; margin: auto;">Absolute center</span>
    </div>
    <div id="positioned_card" style="border-radius: 12px; box-shadow: 0 2px 6px #000;">
        <span id="card_badge" style="position: absolute; top: 4px; right: 6px;">Badge</span>
    </div>
`);

assert.match(positioning.layout, /android:id="@\+id\/fixed_overlay"[\s\S]*app:layout_constraintStart_toStartOf="parent"/);
assert.match(positioning.layout, /android:id="@\+id\/fixed_overlay"[\s\S]*app:layout_constraintEnd_toEndOf="parent"/);
assert.match(positioning.layout, /android:id="@\+id\/fixed_overlay"[\s\S]*app:layout_constraintTop_toTopOf="parent"/);
assert.match(positioning.layout, /android:id="@\+id\/fixed_overlay"[\s\S]*app:layout_constraintBottom_toBottomOf="parent"/);
const fixedOverlayTag = positioning.layout.match(/<LinearLayout\b[^>]*android:id="@\+id\/fixed_overlay"[^>]*\/>/)[0];
assert.match(fixedOverlayTag, /android:layout_width="0dp"/);
assert.match(fixedOverlayTag, /android:layout_height="0dp"/);
assert.match(fixedOverlayTag, /android:layout_marginTop="16dp"/);
assert.match(fixedOverlayTag, /android:layout_marginRight="24dp"/);
assert.match(fixedOverlayTag, /android:layout_marginBottom="32dp"/);
assert.match(fixedOverlayTag, /android:layout_marginLeft="40dp"/);
assert.match(positioning.layout, /<FrameLayout[\s\S]*android:id="@\+id\/positioning_parent"/);
assert.match(positioning.layout, /android:id="@\+id\/positioning_parent"[\s\S]*app:layout_constraintTop_toTopOf="parent"/);
const fillParentView = positioning.layout.match(/<TextView\b[^>]*android:id="@\+id\/fill_parent"[^>]*\/>/)[0];
assert.match(fillParentView, /android:layout_width="match_parent"/);
assert.match(fillParentView, /android:layout_height="match_parent"/);
assert.match(fillParentView, /android:layout_gravity="start\|top"/);
const bottomEndView = positioning.layout.match(/<TextView\b[^>]*android:id="@\+id\/bottom_end"[^>]*\/>/)[0];
assert.match(bottomEndView, /android:layout_gravity="end\|bottom"/);
assert.match(bottomEndView, /android:layout_marginRight="12dp"/);
assert.match(bottomEndView, /android:layout_marginBottom="20dp"/);
const relativeOffsetView = positioning.layout.match(/<TextView\b[^>]*android:id="@\+id\/relative_offset"[^>]*\/>/)[0];
assert.match(relativeOffsetView, /android:translationX="10dp"/);
assert.match(relativeOffsetView, /android:translationY="-4dp"/);
const autoCenterView = positioning.layout.match(/<TextView\b[^>]*android:id="@\+id\/auto_center"[^>]*\/>/)[0];
assert.match(autoCenterView, /android:layout_gravity="center_horizontal"/);
assert.doesNotMatch(autoCenterView, /="auto"/);
const absoluteCenterView = positioning.layout.match(/<TextView\b[^>]*android:id="@\+id\/absolute_center"[^>]*\/>/)[0];
assert.match(absoluteCenterView, /android:layout_gravity="center_horizontal\|center_vertical"/);
assert.match(positioning.layout, /<androidx\.cardview\.widget\.CardView[\s\S]*android:id="@\+id\/positioned_card"[\s\S]*<FrameLayout/);
assert.match(positioning.layout, /android:id="@\+id\/card_badge"[\s\S]*android:layout_gravity="end\|top"/);

const computedSizes = new ShiftLayout().convert(`
    <div id="computed_panel" style="width: calc(100px + 2rem); height: clamp(40px, 5rem, 72px); min-width: min(120px, 8rem); max-height: max(160px, 8rem); padding: min(24px, 2rem); margin: calc(8px + 0.5rem) max(4px, 0.25rem); border-radius: calc(4px + 0.25rem);">
        <span id="computed_text" style="font-size: clamp(14px, 1.25rem, 24px); text-indent: calc(8px * 2);">Computed</span>
        <span id="computed_offset" style="position: relative; left: calc(4px + 0.5rem);">Offset</span>
    </div>
    <div id="computed_grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: calc(8px + 0.5rem);">
        <span id="computed_gap">Gap</span>
    </div>
    <span id="unsupported_math" style="width: calc(100% - 16px);">Fallback</span>
`);

const computedPanelTag = computedSizes.layout.match(/<LinearLayout\b[^>]*android:id="@\+id\/computed_panel"[^>]*>/)[0];
assert.match(computedPanelTag, /android:layout_width="132dp"/);
assert.match(computedPanelTag, /android:layout_height="72dp"/);
assert.match(computedPanelTag, /android:minWidth="120dp"/);
assert.match(computedPanelTag, /android:maxHeight="160dp"/);
assert.match(computedPanelTag, /android:padding="24dp"/);
assert.match(computedPanelTag, /android:layout_marginTop="16dp"/);
assert.match(computedPanelTag, /android:layout_marginRight="4dp"/);
assert.match(computedPanelTag, /android:layout_marginBottom="16dp"/);
assert.match(computedPanelTag, /android:layout_marginLeft="4dp"/);
assert.match(computedPanelTag, /android:background="@drawable\/sl_bg_transparent_r8"/);
const computedTextView = computedSizes.layout.match(/<TextView\b[^>]*android:id="@\+id\/computed_text"[^>]*\/>/)[0];
assert.match(computedTextView, /android:textSize="20sp"/);
assert.match(computedTextView, /android:textIndent="16dp"/);
const computedOffsetView = computedSizes.layout.match(/<TextView\b[^>]*android:id="@\+id\/computed_offset"[^>]*\/>/)[0];
assert.match(computedOffsetView, /android:translationX="12dp"/);
const computedGapView = computedSizes.layout.match(/<TextView\b[^>]*android:id="@\+id\/computed_gap"[^>]*\/>/)[0];
assert.match(computedGapView, /android:layout_marginTop="8dp"/);
assert.match(computedGapView, /android:layout_marginLeft="8dp"/);
const unsupportedMathView = computedSizes.layout.match(/<TextView\b[^>]*android:id="@\+id\/unsupported_math"[^>]*\/>/)[0];
assert.match(unsupportedMathView, /android:layout_width="wrap_content"/);
assert.doesNotMatch(unsupportedMathView, /calc\(/);

const mediaHtml = `
    <style>
        .responsive { color: red; width: 100px; }
        @media screen and (min-width: 600px) {
            .responsive { color: blue; width: 200px; }
            @media (orientation: landscape) {
                .responsive { font-weight: bold; }
            }
        }
        @media (max-width: 599px), print {
            .responsive { color: green; width: 140px; }
        }
        @media print {
            .print_only { text-transform: uppercase; }
        }
    </style>
    <p id="responsive" class="responsive">Profile</p>
    <p id="print_only" class="print_only">Print only</p>
`;

const desktopMedia = new ShiftLayout().convert(mediaHtml, {
    media: { width: 800, height: 600 },
});
const desktopResponsive = desktopMedia.layout.match(/<TextView\b[^>]*android:id="@\+id\/responsive"[^>]*\/>/)[0];
assert.match(desktopResponsive, /android:textColor="#0000FF"/);
assert.match(desktopResponsive, /android:layout_width="200dp"/);
assert.match(desktopResponsive, /android:textStyle="bold"/);
assert.match(desktopMedia.layout, /android:id="@\+id\/print_only"[\s\S]*android:text="Print only"/);

const mobileMedia = new ShiftLayout().convert(mediaHtml, {
    media: { width: 390, height: 844 },
});
const mobileResponsive = mobileMedia.layout.match(/<TextView\b[^>]*android:id="@\+id\/responsive"[^>]*\/>/)[0];
assert.match(mobileResponsive, /android:textColor="#00FF00"/);
assert.match(mobileResponsive, /android:layout_width="140dp"/);
assert.doesNotMatch(mobileResponsive, /android:textStyle="bold"/);

const printMedia = new ShiftLayout().convert(mediaHtml, {
    media: { type: 'print', width: 800, height: 1000 },
});
assert.match(printMedia.layout, /android:id="@\+id\/print_only"[\s\S]*android:text="PRINT ONLY"/);

const noMediaProfile = new ShiftLayout().convert(mediaHtml);
const unprofiledResponsive = noMediaProfile.layout.match(/<TextView\b[^>]*android:id="@\+id\/responsive"[^>]*\/>/)[0];
assert.match(unprofiledResponsive, /android:textColor="#FF0000"/);
assert.match(unprofiledResponsive, /android:layout_width="100dp"/);

const linkedMedia = new ShiftLayout().convert(`
    <link rel="stylesheet" href="responsive.css">
    <p id="linked_media" class="linked_media">Linked media</p>
`, {
    media: { width: '48rem', height: 1024 },
    stylesheets: {
        'responsive.css': '@media (min-width: 700px) { .linked_media { color: #123456; } }',
    },
});
assert.match(linkedMedia.layout, /android:id="@\+id\/linked_media"[\s\S]*android:textColor="#123456"/);
assert.throws(
    () => new ShiftLayout().convert('<p>Invalid media</p>', { media: 'desktop' }),
    /media must be an object/
);

const diagnosticConverter = new ShiftLayout();
const diagnostics = diagnosticConverter.convert(`
    <style>
        .broken[ { color: red; }
    </style>
    <link rel="stylesheet" href="missing.css">
    <div id="diagnostics" class="panel" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; transition: all 200ms; position: sticky; left: 10%; background-image: url(hero.png); box-shadow: inset 0 2px 4px #000; width: calc(100% - 16px); --brand: #123456;">
        Diagnostics
    </div>
`);

assert.ok(Array.isArray(diagnostics.warnings));
assert.ok(diagnostics.warnings.every(warning => ['code', 'message', 'element', 'property', 'value'].every(key => key in warning)));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'missing-stylesheet' && warning.value === 'missing.css'));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'invalid-css-selector' && warning.value === '.broken['));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'unsupported-css-property' && warning.property === 'transition'));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'unsupported-css-value' && warning.property === 'position'));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'unsupported-css-value' && warning.property === 'left'));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'unsupported-css-value' && warning.property === 'background-image'));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'unsupported-css-value' && warning.property === 'box-shadow'));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'unsupported-css-value' && warning.property === 'width'));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'approximated-css' && warning.property === 'display'));
assert.ok(diagnostics.warnings.some(warning => warning.code === 'approximated-css' && warning.property === 'gap'));
assert.ok(diagnostics.warnings.some(warning => warning.element === 'div#diagnostics.panel'));
assert.ok(!diagnostics.warnings.some(warning => warning.property === '--brand'));

const cleanDiagnostics = diagnosticConverter.convert('<p style="color: #123456;">Clean</p>');
assert.deepEqual(cleanDiagnostics.warnings, []);

const assetTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shiftlayout-assets-'));
try {
    const assetBase = path.join(assetTestRoot, 'source');
    const assetOutput = path.join(assetTestRoot, 'android');
    fs.mkdirSync(path.join(assetBase, 'assets', 'xhdpi'), { recursive: true });
    fs.writeFileSync(path.join(assetBase, 'assets', 'xhdpi', 'logo@2x.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(assetBase, 'assets', 'photo.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
    fs.writeFileSync(path.join(assetBase, 'assets', 'vector.svg'), `
        <svg width="24" height="24" viewBox="0 0 24 24">
            <g id="badge" transform="translate(1 2)">
                <path id="check" d="M2,12 L9,19 L22,4" fill="none" stroke="#123456" stroke-width="2" stroke-linecap="round" />
                <rect x="4" y="4" width="8" height="6" rx="2" fill="rgba(10,20,30,0.5)" fill-rule="evenodd" />
                <circle cx="18" cy="18" r="3" fill="#abcdef" opacity="0.5" />
            </g>
        </svg>
    `, 'utf8');
    fs.writeFileSync(path.join(assetBase, 'assets', 'unsupported.svg'), `
        <svg width="24" height="24" viewBox="0 0 24 24">
            <image href="https://example.com/image.png" width="24" height="24" />
        </svg>
    `, 'utf8');
    fs.writeFileSync(path.join(assetTestRoot, 'outside.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const assetResult = new ShiftLayout().convert(`
        <img id="logo_one" src="assets/xhdpi/logo@2x.png?v=1" alt="Logo">
        <img id="logo_two" src="assets/xhdpi/logo@2x.png?v=1" alt="Logo again">
        <img id="photo" src="/assets/photo.jpg" data-android-density="hdpi" alt="Photo">
        <img id="vector" src="assets/vector.svg" alt="Vector">
        <img id="unsupported_vector" src="assets/unsupported.svg" alt="Unsupported vector">
        <img id="outside" src="../outside.png" alt="Outside">
        <img id="remote" src="https://example.com/remote.png" alt="Remote">
    `);

    assert.match(assetResult.layout, /android:id="@\+id\/logo_one"[\s\S]*android:src="@drawable\/logo"/);
    assert.match(assetResult.layout, /android:id="@\+id\/logo_two"[\s\S]*android:src="@drawable\/logo"/);
    assert.equal(assetResult.assets.images.filter(image => image.source.includes('logo@2x')).length, 1);
    assert.equal(assetResult.assets.images.find(image => image.resource === 'photo').density, 'hdpi');

    const writeReport = ShiftLayout.writeResources(assetOutput, assetResult, {
        baseDir: assetBase,
        layoutName: 'Profile Screen',
    });

    assert.ok(fs.existsSync(path.join(assetOutput, 'res', 'layout', 'profile_screen.xml')));
    assert.ok(fs.existsSync(path.join(assetOutput, 'res', 'drawable-xhdpi', 'logo.png')));
    assert.ok(fs.existsSync(path.join(assetOutput, 'res', 'drawable-hdpi', 'photo.jpg')));
    const vectorPath = path.join(assetOutput, 'res', 'drawable', 'vector.xml');
    assert.ok(fs.existsSync(vectorPath));
    const vectorXml = fs.readFileSync(vectorPath, 'utf8');
    assert.match(vectorXml, /<vector/);
    assert.match(vectorXml, /android:viewportWidth="24"/);
    assert.match(vectorXml, /android:translateX="1"/);
    assert.match(vectorXml, /android:pathData="M2,12 L9,19 L22,4"/);
    assert.match(vectorXml, /android:strokeColor="#123456"/);
    assert.match(vectorXml, /android:strokeLineCap="round"/);
    assert.match(vectorXml, /android:fillType="evenOdd"/);
    assert.match(vectorXml, /android:fillAlpha="0\.5"/);
    assert.ok(fs.existsSync(path.join(assetOutput, 'assets', 'images.json')));
    assert.ok(fs.existsSync(path.join(assetOutput, 'diagnostics', 'warnings.json')));
    assert.ok(fs.existsSync(path.join(assetOutput, 'diagnostics', 'assets.json')));
    assert.equal(writeReport.copiedImages.length, 3);
    assert.ok(writeReport.copiedImages.some(image => image.resource === 'vector' && image.format === 'vector'));
    assert.ok(writeReport.skippedImages.some(image => image.source.includes('remote.png') && image.reason === 'remote'));
    assert.ok(writeReport.warnings.some(warning => warning.code === 'unsupported-svg-content' && warning.source.includes('unsupported.svg')));
    assert.ok(writeReport.warnings.some(warning => warning.code === 'empty-vector' && warning.source.includes('unsupported.svg')));
    assert.ok(writeReport.warnings.some(warning => warning.code === 'image-outside-base-dir' && warning.source === '../outside.png'));
} finally {
    fs.rmSync(assetTestRoot, { recursive: true, force: true });
}

assert.equal(resourceNameFromPath('https://cdn.example.com/images/123 logo.webp?size=2#hash'), 'placeholder_123_logo');

const media = new ShiftLayout().convert(`
    <img id="logo" src="https://cdn.example.com/images/123 logo.webp?size=2#hash" width="320" height="180" aria-label="Company logo">
    <img id="avatar" src="/assets/user.png?v=1" width="48px" title="User profile">
    <img id="responsive" srcset="/assets/small-photo.jpg 1x, /assets/large-photo.jpg 2x" alt="Responsive photo" style="background-size: cover;">
    <img id="src_wins" src="/assets/source.png" srcset="/assets/ignored.png 2x" alt="Source wins">
    <img id="centered_image" src="/assets/centered.png" style="background-position: center;">
    <picture>
        <source srcset="/assets/large.webp" media="(min-width: 800px)">
        <img id="picture_img" src="/assets/fallback.png" alt="Picture fallback">
    </picture>
`);

assert.match(media.layout, /android:src="@drawable\/placeholder_123_logo"/);
assert.match(media.layout, /android:layout_width="320dp"/);
assert.match(media.layout, /android:layout_height="180dp"/);
assert.match(media.layout, /android:contentDescription="Company logo"/);
assert.match(media.layout, /android:id="@\+id\/logo"[\s\S]*android:adjustViewBounds="true"/);
assert.match(media.layout, /android:src="@drawable\/user"/);
assert.match(media.layout, /android:layout_width="48dp"/);
assert.match(media.layout, /android:contentDescription="User profile"/);
assert.match(media.layout, /android:id="@\+id\/avatar"[\s\S]*android:adjustViewBounds="true"/);
assert.match(media.layout, /android:id="@\+id\/responsive"[\s\S]*android:src="@drawable\/small_photo"/);
assert.match(media.layout, /android:id="@\+id\/responsive"[\s\S]*android:contentDescription="Responsive photo"/);
assert.match(media.layout, /android:id="@\+id\/responsive"[\s\S]*android:scaleType="centerCrop"/);
assert.match(media.layout, /android:id="@\+id\/src_wins"[\s\S]*android:src="@drawable\/source"/);
assert.match(media.layout, /android:id="@\+id\/centered_image"[\s\S]*android:scaleType="center"/);
assert.match(media.layout, /android:id="@\+id\/picture_img"[\s\S]*android:src="@drawable\/fallback"/);
assert.deepEqual(media.assets.images.map(image => image.resource), [
    'placeholder_123_logo',
    'user',
    'small_photo',
    'source',
    'centered',
    'fallback',
]);
assert.equal(media.assets.images[0].source, 'https://cdn.example.com/images/123 logo.webp?size=2#hash');
assert.ok(!media.layout.includes('<source'));
assert.ok(!media.layout.includes('<picture'));

const htmlSizing = new ShiftLayout().convert(`
    <input id="sized_input" type="text" width="260" height="52">
    <div id="sized_card" width="280" height="160" style="border-radius: 8px; box-shadow: 0 2px 6px #000;">
        <span>Card</span>
    </div>
    <section id="centered" style="top: 0px; bottom: 0px;">
        <p>Centered</p>
    </section>
`);

assert.match(htmlSizing.layout, /android:layout_width="260dp"[\s\S]*android:id="@\+id\/sized_input"/);
assert.match(htmlSizing.layout, /android:layout_height="52dp"[\s\S]*android:id="@\+id\/sized_input"/);
assert.match(htmlSizing.layout, /android:layout_width="280dp"[\s\S]*android:id="@\+id\/sized_card"/);
assert.match(htmlSizing.layout, /android:layout_height="160dp"[\s\S]*android:id="@\+id\/sized_card"/);
assert.match(htmlSizing.layout, /android:id="@\+id\/centered"[\s\S]*app:layout_constraintTop_toTopOf="parent"/);
assert.match(htmlSizing.layout, /android:id="@\+id\/centered"[\s\S]*app:layout_constraintBottom_toBottomOf="parent"/);

const accessibility = new ShiftLayout().convert(`
    <button id="icon_button" aria-label="Open menu"></button>
    <p id="helper" title="Helpful text">?</p>
    <div id="dismissed" hidden>Gone</div>
    <div id="role_button" role="button" aria-label="Open details">Details</div>
    <span id="script_action" onclick="openDetails()">Open</span>
    <button id="disabled_by_aria" aria-disabled="true">Disabled</button>
    <button id="toggle" aria-expanded="false" aria-pressed="true">Toggle</button>
    <p id="status_message" aria-live="polite">Saved</p>
    <p id="arabic" dir="rtl" lang="ar">مرحبا</p>
    <span id="presentation" role="presentation">Decorative role</span>
    <span id="decorative_text" aria-hidden="true">Decoration</span>
    <img id="decorative_image" src="divider.png" alt="">
`);

assert.match(accessibility.layout, /android:id="@\+id\/icon_button"[\s\S]*android:contentDescription="Open menu"/);
assert.match(accessibility.layout, /android:id="@\+id\/helper"[\s\S]*android:contentDescription="Helpful text"/);
assert.match(accessibility.layout, /android:id="@\+id\/dismissed"[\s\S]*android:visibility="gone"/);
assert.match(accessibility.layout, /android:id="@\+id\/role_button"[\s\S]*android:clickable="true"/);
assert.match(accessibility.layout, /android:id="@\+id\/role_button"[\s\S]*android:foreground="\?attr\/selectableItemBackground"/);
assert.match(accessibility.layout, /android:id="@\+id\/script_action"[\s\S]*android:focusable="true"/);
assert.match(accessibility.layout, /android:id="@\+id\/disabled_by_aria"[\s\S]*android:enabled="false"/);
assert.match(accessibility.layout, /android:id="@\+id\/toggle"[\s\S]*android:stateDescription="collapsed, pressed"/);
assert.match(accessibility.layout, /android:id="@\+id\/status_message"[\s\S]*android:accessibilityLiveRegion="polite"/);
assert.match(accessibility.layout, /android:id="@\+id\/arabic"[\s\S]*android:textDirection="rtl"/);
assert.match(accessibility.layout, /android:id="@\+id\/arabic"[\s\S]*android:layoutDirection="rtl"/);
assert.match(accessibility.layout, /android:id="@\+id\/arabic"[\s\S]*android:textLocale="ar"/);
assert.match(accessibility.layout, /android:id="@\+id\/presentation"[\s\S]*android:importantForAccessibility="no"/);
assert.match(accessibility.layout, /android:id="@\+id\/decorative_text"[\s\S]*android:importantForAccessibility="no"/);
assert.match(accessibility.layout, /android:id="@\+id\/decorative_image"[\s\S]*android:contentDescription=""/);
assert.match(accessibility.layout, /android:id="@\+id\/decorative_image"[\s\S]*android:importantForAccessibility="no"/);

const navIds = new ShiftLayout().convert(`
    <nav id="main_nav">
        <a>Home</a>
        <a>Home</a>
        <a></a>
    </nav>
`);

assert.match(navIds.menus['main_nav_menu.xml'], /android:id="@\+id\/nav_home"/);
assert.match(navIds.menus['main_nav_menu.xml'], /android:id="@\+id\/nav_home_2"/);
assert.match(navIds.menus['main_nav_menu.xml'], /android:id="@\+id\/nav_item_3"/);

const rangeInput = new ShiftLayout().convert(`
    <input id="volume" type="range" min="0" max="100" value="65" disabled>
    <input id="narrow_volume" type="range" value="4" style="width: 120px;">
    <meter id="storage" value="72" max="100"></meter>
`);

assert.match(rangeInput.layout, /<SeekBar/);
assert.match(rangeInput.layout, /android:id="@\+id\/volume"/);
assert.match(rangeInput.layout, /android:min="0"/);
assert.match(rangeInput.layout, /android:max="100"/);
assert.match(rangeInput.layout, /android:progress="65"/);
assert.match(rangeInput.layout, /android:enabled="false"/);
assert.match(rangeInput.layout, /android:id="@\+id\/narrow_volume"[\s\S]*android:progress="4"/);
assert.match(rangeInput.layout, /android:layout_width="120dp"[\s\S]*android:id="@\+id\/narrow_volume"/);
assert.match(rangeInput.layout, /<ProgressBar[\s\S]*android:id="@\+id\/storage"[\s\S]*style="@style\/Widget\.AppCompat\.ProgressBar\.Horizontal"/);
assert.match(rangeInput.layout, /android:id="@\+id\/storage"[\s\S]*android:max="100"/);
assert.match(rangeInput.layout, /android:id="@\+id\/storage"[\s\S]*android:progress="72"/);

const insetLayout = new ShiftLayout().convert(`
    <div id="stage" style="width: 100%; height: 100%;">
        <span id="fill" style="position: absolute; inset: 0;">Fill</span>
        <span id="offset" style="position: absolute; inset: 4px 8px 12px 16px;">Offset</span>
    </div>
`);

assert.match(insetLayout.layout, /<FrameLayout/);
assert.match(insetLayout.layout, /android:id="@\+id\/fill"[\s\S]*android:layout_gravity="start\|top"/);
assert.match(insetLayout.layout, /android:id="@\+id\/fill"[\s\S]*android:layout_marginTop="0dp"/);
assert.match(insetLayout.layout, /android:id="@\+id\/fill"[\s\S]*android:layout_marginRight="0dp"/);
assert.match(insetLayout.layout, /android:id="@\+id\/offset"[\s\S]*android:layout_marginTop="4dp"/);
assert.match(insetLayout.layout, /android:id="@\+id\/offset"[\s\S]*android:layout_marginRight="8dp"/);
assert.match(insetLayout.layout, /android:id="@\+id\/offset"[\s\S]*android:layout_marginBottom="12dp"/);
assert.match(insetLayout.layout, /android:id="@\+id\/offset"[\s\S]*android:layout_marginLeft="16dp"/);

const hiddenInput = new ShiftLayout().convert(`
    <form>
        <input id="csrf_token" type="hidden" value="abc123">
        <input id="visible_field" type="text" value="shown">
    </form>
`);

assert.ok(!hiddenInput.layout.includes('csrf_token'));
assert.match(hiddenInput.layout, /android:id="@\+id\/visible_field"/);
assert.match(hiddenInput.layout, /android:text="shown"/);

const labels = new ShiftLayout({ prefix: 'field' }).convert(`
    <form>
        <label id="email_label" for="email">Email</label>
        <input id="email" type="email">
        <label id="pin_label" for="123-pin">PIN</label>
        <input id="123-pin" type="number">
    </form>
`);

assert.match(labels.layout, /android:id="@\+id\/email_label"[\s\S]*android:labelFor="@id\/email"/);
assert.match(labels.layout, /android:id="@\+id\/pin_label"[\s\S]*android:labelFor="@id\/field_123_pin"/);

const lists = new ShiftLayout().convert(`
    <ul>
        <li>Alpha</li>
        <li>Beta & more</li>
    </ul>
    <ol>
        <li>First</li>
        <li>Second</li>
    </ol>
    <ol start="5">
        <li>Fifth</li>
        <li>Sixth</li>
    </ol>
    <ol start="10" reversed>
        <li>Tenth</li>
        <li>Ninth</li>
    </ol>
`);

assert.match(lists.layout, /android:text="- Alpha"/);
assert.match(lists.layout, /android:text="- Beta &amp; more"/);
assert.match(lists.layout, /android:text="1\. First"/);
assert.match(lists.layout, /android:text="2\. Second"/);
assert.match(lists.layout, /android:text="5\. Fifth"/);
assert.match(lists.layout, /android:text="6\. Sixth"/);
assert.match(lists.layout, /android:text="11\. Tenth"/);
assert.match(lists.layout, /android:text="10\. Ninth"/);

const links = new ShiftLayout().convert(`
    <a id="site" href="https://example.com?a=1&b=2">Website</a>
    <a id="email_link" href="mailto:hello@example.com">Email</a>
    <a id="phone_link" href="tel:+441234567890">Phone</a>
    <a id="route_link" href="/settings">Settings</a>
`);

assert.match(links.layout, /android:id="@\+id\/site"[\s\S]*android:autoLink="web"/);
assert.match(links.layout, /android:id="@\+id\/site"[\s\S]*android:tag="https:\/\/example\.com\?a=1&amp;b=2"/);
assert.match(links.layout, /android:id="@\+id\/email_link"[\s\S]*android:autoLink="email"/);
assert.match(links.layout, /android:id="@\+id\/phone_link"[\s\S]*android:autoLink="phone"/);
assert.match(links.layout, /android:id="@\+id\/route_link"[\s\S]*android:clickable="true"/);
assert.match(links.layout, /android:id="@\+id\/route_link"[\s\S]*android:focusable="true"/);
assert.match(links.layout, /android:id="@\+id\/route_link"[\s\S]*android:tag="\/settings"/);

const textTransforms = new ShiftLayout().convert(`
    <p id="shout" style="text-transform: uppercase;">Quiet launch</p>
    <p id="whisper" style="text-transform: lowercase;">MIXED Case</p>
    <p id="title" style="text-transform: capitalize;">fresh start</p>
    <p id="decorated" style="text-decoration: underline line-through;">Marked up</p>
    <p id="indented" style="text-indent: 24px; overflow-wrap: break-word;">Indented</p>
`);

assert.match(textTransforms.layout, /android:id="@\+id\/shout"[\s\S]*android:text="QUIET LAUNCH"/);
assert.match(textTransforms.layout, /android:id="@\+id\/whisper"[\s\S]*android:text="mixed case"/);
assert.match(textTransforms.layout, /android:id="@\+id\/title"[\s\S]*android:text="Fresh Start"/);
assert.match(textTransforms.layout, /android:id="@\+id\/decorated"[\s\S]*android:paintFlags="underline\|strikeThru"/);
assert.match(textTransforms.layout, /android:id="@\+id\/indented"[\s\S]*android:textIndent="24dp"/);
assert.match(textTransforms.layout, /android:id="@\+id\/indented"[\s\S]*android:breakStrategy="high_quality"/);

const inlineSemantics = new ShiftLayout().convert(`
    <p id="nested_inline">Hello <strong>bold</strong> and <em>soft</em></p>
    <strong id="standalone_strong">Important</strong>
    <em id="standalone_em">Emphasis</em>
    <code id="inline_code">npm test</code>
    <pre id="code_block">line one
line two</pre>
    <mark id="highlight">Marked</mark>
    <small id="fine_print">Fine print</small>
    <u id="underlined">Underlined</u>
    <del id="removed">Removed</del>
    <ins id="inserted">Inserted</ins>
    <time id="published">2026-05-17</time>
    <abbr id="abbr" title="Application Programming Interface">API</abbr>
    <dfn id="term">Layout</dfn>
    <samp id="sample">OK</samp>
    <blockquote id="quote_block">Quoted block</blockquote>
    <q id="inline_quote">quoted inline</q>
    <address id="contact">123 Main</address>
    <sup id="superscript">2</sup>
    <sub id="subscript">n</sub>
`);

assert.match(inlineSemantics.layout, /android:id="@\+id\/nested_inline"[\s\S]*android:text="Hello bold and soft"/);
assert.ok(!inlineSemantics.layout.includes('android:text="bold"'));
assert.match(inlineSemantics.layout, /android:id="@\+id\/standalone_strong"[\s\S]*android:textStyle="bold"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/standalone_em"[\s\S]*android:textStyle="italic"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/inline_code"[\s\S]*android:fontFamily="monospace"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/code_block"[\s\S]*android:singleLine="false"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/highlight"[\s\S]*android:background="#FFFF00"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/fine_print"[\s\S]*android:textScaleX="0.875"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/underlined"[\s\S]*android:paintFlags="underline"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/removed"[\s\S]*android:paintFlags="strikeThru"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/inserted"[\s\S]*android:paintFlags="underline"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/published"[\s\S]*android:text="2026-05-17"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/abbr"[\s\S]*android:contentDescription="Application Programming Interface"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/term"[\s\S]*android:textStyle="italic"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/sample"[\s\S]*android:fontFamily="monospace"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/quote_block"[\s\S]*android:textStyle="italic"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/quote_block"[\s\S]*android:paddingLeft="16dp"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/inline_quote"[\s\S]*android:text="&quot;quoted inline&quot;"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/contact"[\s\S]*android:textStyle="italic"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/superscript"[\s\S]*android:textScaleX="0.75"/);
assert.match(inlineSemantics.layout, /android:id="@\+id\/subscript"[\s\S]*android:textSize="12sp"/);

const lineBreaks = new ShiftLayout().convert(`
    <p id="address">Line one<br>Line two</p>
    <br>
`);

assert.match(lineBreaks.layout, /android:id="@\+id\/address"[\s\S]*android:text="Line one&#10;Line two"/);
assert.match(lineBreaks.layout, /<TextView[\s\S]*android:text="&#10;"/);

const tableLayout = new ShiftLayout().convert(`
    <table id="hours">
        <caption id="hours_caption">Opening hours</caption>
        <thead>
            <tr id="head_row"><th id="day_head" scope="col">Day</th><th id="hours_head">Hours</th></tr>
        </thead>
        <tbody>
            <tr><td id="weekday" colspan="2" headers="day_head hours_head">Mon 9-5</td></tr>
            <tr><td id="status" rowspan="2" align="right" valign="bottom">Open</td></tr>
        </tbody>
    </table>
`);

assert.match(tableLayout.layout, /<TableLayout[\s\S]*android:id="@\+id\/hours"[\s\S]*android:stretchColumns="\*"/);
assert.match(tableLayout.layout, /android:id="@\+id\/hours_caption"[\s\S]*android:text="Opening hours"/);
assert.match(tableLayout.layout, /<TableRow[\s\S]*android:id="@\+id\/head_row"[\s\S]*android:layout_width="match_parent"/);
assert.match(tableLayout.layout, /android:id="@\+id\/day_head"[\s\S]*android:textStyle="bold"/);
assert.match(tableLayout.layout, /android:id="@\+id\/hours_head"[\s\S]*android:gravity="center"/);
assert.match(tableLayout.layout, /android:id="@\+id\/weekday"[\s\S]*android:layout_span="2"/);
assert.match(tableLayout.layout, /android:id="@\+id\/weekday"[\s\S]*android:tag="headers=day_head hours_head"/);
assert.match(tableLayout.layout, /android:id="@\+id\/day_head"[\s\S]*android:tag="scope=col"/);
assert.match(tableLayout.layout, /android:id="@\+id\/status"[\s\S]*android:layout_rowSpan="2"/);
assert.match(tableLayout.layout, /android:id="@\+id\/status"[\s\S]*android:gravity="end\|bottom"/);
assert.ok(!tableLayout.layout.includes('<thead'));
assert.ok(!tableLayout.layout.includes('<tbody'));

const inputButtons = new ShiftLayout().convert(`
    <input id="submit_default" type="submit">
    <input id="submit_value" type="submit" value="Create account">
    <input id="reset_default" type="reset">
    <input id="upload" type="file" accept="image/*" capture="environment" multiple>
    <button id="button_default"></button>
    <button id="button_reset" type="reset"></button>
`);

assert.match(inputButtons.layout, /<com\.google\.android\.material\.button\.MaterialButton[\s\S]*android:id="@\+id\/submit_default"[\s\S]*android:text="Submit"/);
assert.match(inputButtons.layout, /android:id="@\+id\/submit_value"[\s\S]*android:text="Create account"/);
assert.match(inputButtons.layout, /android:id="@\+id\/reset_default"[\s\S]*android:text="Reset"/);
assert.match(inputButtons.layout, /android:id="@\+id\/upload"[\s\S]*android:text="Choose file"/);
assert.match(inputButtons.layout, /android:id="@\+id\/upload"[\s\S]*android:tag="accept=image\/\*;capture=environment;multiple=true"/);
assert.match(inputButtons.layout, /android:id="@\+id\/upload"[\s\S]*android:contentDescription="Choose file"/);
assert.match(inputButtons.layout, /android:id="@\+id\/button_default"[\s\S]*android:text="Button"/);
assert.match(inputButtons.layout, /android:id="@\+id\/button_reset"[\s\S]*android:text="Reset"/);
assert.ok(!inputButtons.layout.includes('TextInputEditText'));

const selects = new ShiftLayout().convert(`
    <select id="plan" multiple size="3" disabled>
        <option>Starter</option>
        <option selected>Team & Business</option>
        <option></option>
    </select>
`);

assert.match(selects.layout, /<Spinner[\s\S]*android:id="@\+id\/plan"[\s\S]*android:entries="@array\/plan_entries"/);
assert.match(selects.layout, /android:id="@\+id\/plan"[\s\S]*android:selectedItemPosition="1"/);
assert.match(selects.layout, /android:id="@\+id\/plan"[\s\S]*android:spinnerMode="dialog"/);
assert.match(selects.layout, /android:id="@\+id\/plan"[\s\S]*android:dropDownHeight="3dp"/);
assert.match(selects.layout, /android:id="@\+id\/plan"[\s\S]*android:enabled="false"/);
assert.match(selects.arrays['plan_entries.xml'], /<string-array name="plan_entries">/);
assert.match(selects.arrays['plan_entries.xml'], /<item>Starter<\/item>/);
assert.match(selects.arrays['plan_entries.xml'], /<item>Team &amp; Business<\/item>/);
assert.match(selects.values['arrays.xml'], /<string-array name="plan_entries">/);
assert.match(selects.values['arrays.xml'], /<item>Team &amp; Business<\/item>/);
assert.equal(selects.resources.values['arrays.xml'], selects.values['arrays.xml']);
assert.equal(selects.resources.menus, selects.menus);
assert.equal(selects.resources.drawables, selects.drawables);
assert.ok(!selects.layout.includes('<option'));

const stylesheet = new ShiftLayout().convert(`
    <style>
        :root {
            --brand: #336699;
        }
        section.panel {
            --brand: #654321;
            color: #101010;
            font-family: Georgia;
        }
        p { margin-top: 4px; color: red; }
        p { margin-top: 8px; }
        .panel .note { color: var(--brand); font-weight: bold; }
        #inline_wins { color: #123456; }
        .important { color: green !important; }
        [data-tone="alert"] { text-transform: uppercase; }
        h2, .grouped { text-align: center; }
        .variable { color: var(--brand, #000000); }
    </style>
    <section class="panel">
        <p id="inline_wins" class="note" style="color: black;">Inline</p>
        <p id="important" class="note important" style="color: black;">Important</p>
        <p id="attribute" data-tone="alert">Attribute text</p>
        <p id="grouped" class="grouped">Grouped</p>
        <span id="variable" class="variable">Variable</span>
        <span id="inherited">Inherited</span>
    </section>
`);

assert.match(stylesheet.layout, /android:id="@\+id\/inline_wins"[\s\S]*android:textColor="#000000"/);
assert.match(stylesheet.layout, /android:id="@\+id\/inline_wins"[\s\S]*android:textStyle="bold"/);
assert.match(stylesheet.layout, /android:id="@\+id\/inline_wins"[\s\S]*android:layout_marginTop="8dp"/);
assert.match(stylesheet.layout, /android:id="@\+id\/important"[\s\S]*android:textColor="#00FF00"/);
assert.match(stylesheet.layout, /android:id="@\+id\/attribute"[\s\S]*android:text="ATTRIBUTE TEXT"/);
assert.match(stylesheet.layout, /android:id="@\+id\/grouped"[\s\S]*android:gravity="center"/);
assert.match(stylesheet.layout, /android:id="@\+id\/variable"[\s\S]*android:textColor="#654321"/);
assert.match(stylesheet.layout, /android:id="@\+id\/inherited"[\s\S]*android:textColor="#101010"/);
assert.match(stylesheet.layout, /android:id="@\+id\/inherited"[\s\S]*android:fontFamily="serif"/);
assert.ok(!stylesheet.layout.includes('<style'));

const linkedStylesheets = new ShiftLayout().convert(`
    <style>
        .status, .after_link { color: red; }
    </style>
    <link rel="stylesheet" href="theme.css">
    <link rel="stylesheet" href="not-provided.css">
    <style>
        .after_link { color: #445566; }
    </style>
    <p id="link_wins" class="status">Linked</p>
    <p id="embedded_wins" class="after_link">Embedded</p>
`, {
    stylesheets: {
        'theme.css': '.status, .after_link { color: #112233; width: 200px; }',
    },
});

assert.match(linkedStylesheets.layout, /android:id="@\+id\/link_wins"[\s\S]*android:textColor="#112233"/);
const linkWinsView = linkedStylesheets.layout.match(/<TextView\b[^>]*android:id="@\+id\/link_wins"[^>]*\/>/)[0];
assert.match(linkWinsView, /android:layout_width="200dp"/);
assert.match(linkedStylesheets.layout, /android:id="@\+id\/embedded_wins"[\s\S]*android:textColor="#445566"/);
assert.ok(!linkedStylesheets.layout.includes('<link'));

const mappedStylesheet = new ShiftLayout().convert(`
    <link rel="stylesheet" href="map.css">
    <p id="mapped" class="mapped">Map source</p>
`, {
    stylesheets: new Map([['map.css', '.mapped { color: #ABCDEF; }']]),
});
assert.match(mappedStylesheet.layout, /android:id="@\+id\/mapped"[\s\S]*android:textColor="#ABCDEF"/);

const unloadedStylesheet = new ShiftLayout().convert(`
    <link rel="stylesheet" href="remote.css">
    <p id="unloaded">No hidden load</p>
`);
assert.doesNotMatch(unloadedStylesheet.layout, /android:id="@\+id\/unloaded"[\s\S]*android:textColor=/);
assert.throws(
    () => new ShiftLayout().convert('<p>Invalid</p>', { stylesheets: ['body { color: red; }'] }),
    /stylesheets must be an object or Map/
);
assert.throws(
    () => new ShiftLayout().convert('<p>Invalid</p>', { stylesheets: { 'theme.css': 42 } }),
    /must be provided as a CSS string/
);

console.log('All ShiftLayout tests passed.');
