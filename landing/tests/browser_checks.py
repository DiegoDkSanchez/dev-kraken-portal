"""Pruebas de UI. Requiere Playwright para Python y Chromium; no son dependencias del sitio.
Ejecutar con un servidor local: python tests/browser_checks.py
Todas las solicitudes de prueba se interceptan; no se envían prospectos reales.
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:4173')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.locator('[data-services] article').first.wait_for()
    assert page.locator('h1').count() == 1
    assert page.locator('[data-services] article').count() == 6
    assert page.locator('[data-demos] article').count() == 2
    assert page.locator('.methodology-phase').count() == 4
    assert page.locator('[data-manifesto]').inner_text() == 'No creamos software para las máquinas; lo diseñamos para las personas.'
    for link in page.locator('a[href^="#"]').all():
        anchor = link.get_attribute('href')
        assert len(anchor) > 1 and page.locator(anchor).count(), anchor
    for trigger in page.locator('[data-source="services"]').all():
        service = trigger.get_attribute('data-service')
        trigger.click()
        assert page.locator('[name="serviceId"]').input_value() == service
        assert page.locator(f'[data-service-need="{service}"]').get_attribute('aria-pressed') == 'true'
        page.keyboard.press('Escape')
        assert trigger.evaluate('(el) => el === document.activeElement')
    page.locator('.hero [data-consultation-trigger]').click()
    assert page.locator('[name="serviceId"]').input_value() == 'consulting'
    page.locator('[data-step="1"] [data-next]').click()
    page.locator('[data-step="2"] [data-next]').click()
    assert page.locator('[data-step="2"]').is_visible()
    for field, value in [('fullName','   '),('email','invalid'),('company','Empresa de prueba')]:
        page.locator(f'form [name="{field}"]').fill(value)
    page.locator('[data-step="2"] [data-next]').click()
    assert page.locator('[data-step="2"]').is_visible()
    def fill_business():
        for field, value in [('fullName','Persona de prueba'),('email','test@example.com'),('company','Empresa de prueba'),('description','<script>prueba</script>')]:
            page.locator(f'form [name="{field}"]').fill(value)
    fill_business()
    page.locator('[data-step="2"] [data-next]').click()
    assert '<script>prueba</script>' in page.locator('[data-summary]').inner_text()
    assert page.locator('[data-summary] script').count() == 0
    assert page.locator('[type="submit"]').is_disabled()
    assert page.locator('[data-email-fallback]').get_attribute('href').startswith('mailto:')
    assert page.locator('[data-confirmation]').is_hidden()
    page.locator('[data-step="3"] [data-consultation-back]').click()
    assert page.locator('[name="company"]').input_value() == 'Empresa de prueba'
    page.keyboard.press('Escape')
    # Both demo entry points preserve their selection through all three steps.
    for demo in ['operations','field-service']:
        page.locator(f'[data-demo="{demo}"]').click()
        page.locator('[data-step="1"] [data-next]').click()
        fill_business()
        page.locator('[data-step="2"] [data-next]').click()
        assert page.locator('[name="demoRequested"]').is_checked()
        assert page.locator('[name="demoId"]').input_value() == demo
        page.keyboard.press('Escape')
    # Controlled receptor stub: failure, malformed success, confirmed success, pending demo.
    page.evaluate("window.DEV_KRAKEN_CONTACT.endpoint = '/test-contact'")
    requests = []
    mode = {'value': 'error'}
    def receptor(route):
        requests.append(route.request.post_data_json)
        if mode['value'] == 'error': route.fulfill(status=500, json={'accepted': False})
        elif mode['value'] == 'malformed': route.fulfill(status=200, json={})
        else: route.fulfill(status=200, json={'accepted': True, 'demoAccess': {'status':'pending'}})
    page.route('**/test-contact', receptor)
    page.locator('[data-demo="operations"]').click()
    page.locator('[data-step="1"] [data-next]').click()
    fill_business()
    page.locator('[data-step="2"] [data-next]').click()
    for value in ['error','malformed']:
        mode['value'] = value
        page.locator('[type="submit"]').click()
        page.locator('[data-form-error]').wait_for(state='visible')
        assert page.locator('[data-confirmation]').is_hidden()
        assert page.locator('[name="demoId"]').input_value() == 'operations'
    mode['value'] = 'success'
    page.locator('[type="submit"]').click()
    page.locator('[data-confirmation]').wait_for(state='visible')
    assert page.locator('[data-access-status]').is_visible()
    assert requests[-1]['demoId'] == 'operations'
    assert requests[-1]['serviceId'] == 'demo'
    assert requests[-1]['source'] == 'demo'
    assert requests[-1]['company'] == 'Empresa de prueba'
    page.keyboard.press('Escape')
    # Delayed request: loading state, duplicate protection, close cancels stale response.
    page.unroute('**/test-contact', receptor)
    page.route('**/test-contact', lambda route: route.abort())
    page.evaluate("() => { window.DEV_KRAKEN_CONTACT.submit = (data, signal) => new Promise((resolve, reject) => { window.resolveContact = resolve; signal.addEventListener('abort', () => reject(new Error('aborted'))); }); }")
    page.locator('.hero [data-consultation-trigger]').click()
    page.locator('[data-step="1"] [data-next]').click()
    fill_business()
    page.locator('[data-step="2"] [data-next]').click()
    page.locator('[type="submit"]').click()
    assert page.locator('[data-submit-loading]').is_visible()
    assert page.locator('[type="submit"]').is_disabled()
    page.keyboard.press('Escape')
    page.evaluate('window.resolveContact({accepted:true})')
    page.locator('.hero [data-consultation-trigger]').click()
    assert page.locator('[data-step="1"]').is_visible()
    assert page.locator('[data-confirmation]').is_hidden()
    page.locator('.consultation-close').focus()
    page.keyboard.press('Shift+Tab')
    assert page.locator('[data-step="1"] [data-next]').evaluate('(el) => el === document.activeElement')
    page.keyboard.press('Tab')
    assert page.locator('.consultation-close').evaluate('(el) => el === document.activeElement')
    page.keyboard.press('Escape')
    for width in [320, 390, 768, 1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow at {width}'
        page.locator('.hero [data-consultation-trigger]').click()
        assert page.locator('.consultation-panel').evaluate('(el) => el.scrollWidth <= el.clientWidth'), f'Modal overflow at {width}'
        page.keyboard.press('Escape')
    page.set_viewport_size({'width':1440,'height':1000})
    page.evaluate('document.activeElement.blur(); window.scrollTo(0, 0)')
    page.screenshot(path='/tmp/dev-kraken-desktop.png', full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path='/tmp/dev-kraken-mobile.png', full_page=True)
    page.goto(BASE + '/privacy.html#web-terms')
    assert page.locator('#web-terms').is_visible()
    assert not errors, errors
    # Existing animations should finish with normal motion too.
    page.emulate_media(reduced_motion='no-preference')
    page.goto(BASE)
    page.locator('[data-manifesto]').scroll_into_view_if_needed()
    page.wait_for_timeout(1800)
    assert page.locator('[data-manifesto]').inner_text() == 'No creamos software para las máquinas; lo diseñamos para las personas.'
    assert not errors, errors
    browser.close()
    print('PASS: contenido, seis servicios, dos demos, validaciones, estado, payload, errores, confirmación real simulada, carga, cancelación, foco, responsive, privacidad y animación.')
