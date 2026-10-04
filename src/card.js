import { LitElement,html,css,unsafeCSS,nothing } from 'lit';
import { Calendar } from '@fullcalendar/core';
import dayGrid from '@fullcalendar/daygrid';
import timeGrid from '@fullcalendar/timegrid';
import interaction from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import ru from '@fullcalendar/core/locales/ru';
import es from '@fullcalendar/core/locales/es';
import { DateTime } from 'luxon';
import { VIEWS,validateConfig,dayKey,shiftDay,eventsOnDay,fetchCalendars } from './calendar-model.js';
import styles from './card.css';
import vendorStyles from './vendor-calendar.css';

class BelovodieCalendarCard extends LitElement {
  static properties = { _config:{state:true},_view:{state:true},_selected:{state:true},_events:{state:true},_loading:{state:true},_failed:{state:true},_hidden:{state:true},_detail:{state:true},_revision:{state:true},_sources:{state:true},_inventoryFailed:{state:true} };
  static styles=[css`${unsafeCSS(vendorStyles)}`,css`${unsafeCSS(styles)}`];
  constructor() {
    super();this._events=[];this._failed=[];this._hidden=new Set();this._loading=false;this._requestId=0;this._revision=0;
    this._onVisibility=()=>{if(document.visibilityState==='visible')this._load();};
  }
  setConfig(config) {
    this._config=validateConfig(config);this._view=this._config.default_view;this._sources=this._config.entities;this._inventoryFailed=false;
    this._resize?.disconnect();this._calendar?.destroy();this._calendar=null;this._range=null;this._requestId++;
    this._selected=dayKey(new Date(),this._zone());this._hidden=new Set();
    this.style.height=this._config.height;this.requestUpdate();
  }
  set hass(hass) {
    const previous=this._hass;this._hass=hass;
    if (!this._config) return;
    if (this._calendar && this._calendar.getOption('timeZone')!==this._zone()) {
      this._calendar.setOption('timeZone',this._zone());this._selected=dayKey(this._calendar.getDate(),this._zone());
    }
    this._revision++;
    const changed=!previous || this._config.entities.some(s=>previous.states[s.entity]!==hass.states[s.entity]);
    if (changed && this._range) this._load();
  }
  _zone() { return this._config?.time_zone || this._hass?.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone; }
  _locale() { return this._config?.language || this._hass?.locale?.language || 'ru'; }
  _name(entity) {return this._config.entities.find(s=>s.entity===entity)?.name || this._hass?.states[entity]?.attributes?.friendly_name || entity;}
  connectedCallback() {
    super.connectedCallback();
    this._timer=setInterval(()=>{this._revision++;this._load();},300000);
    document.addEventListener('visibilitychange',this._onVisibility);
    this.updateComplete.then(()=>this._initialize());
  }
  disconnectedCallback() {
    super.disconnectedCallback();clearInterval(this._timer);document.removeEventListener('visibilitychange',this._onVisibility);
    this._resize?.disconnect();this._calendar?.destroy();this._calendar=null;this._requestId++;
  }
  updated() { this._initialize(); }
  _initialize() {
    const container=this.renderRoot.querySelector('#calendar');
    if (!container || this._calendar || !this._config || !this.isConnected) return;
    this._calendar=new Calendar(container,{
      plugins:[dayGrid,timeGrid,interaction,luxonPlugin],locales:[ru,es],locale:this._locale(),timeZone:this._zone(),
      initialView:VIEWS[this._view],initialDate:this._selected,headerToolbar:false,firstDay:1,
      height:'100%',expandRows:true,nowIndicator:true,allDaySlot:true,allDayText:'Весь день',
      slotMinTime:`${String(this._config.start_hour).padStart(2,'0')}:00:00`,slotMaxTime:`${String(this._config.end_hour).padStart(2,'0')}:00:00`,
      slotDuration:'01:00:00',slotLabelInterval:'01:00:00',slotLabelFormat:{hour:'2-digit',minute:'2-digit',hour12:false},
      eventTimeFormat:{hour:'2-digit',minute:'2-digit',hour12:false},dayMaxEvents:true,fixedWeekCount:false,
      displayEventEnd:true,eventClick:arg=>{arg.jsEvent.preventDefault();this._openEvent(arg.event.id);},
      eventDidMount:arg=>{arg.el.tabIndex=0;arg.el.setAttribute('role','button');arg.el.setAttribute('aria-label',arg.event.title);arg.el.addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();this._openEvent(arg.event.id);}});},
      dateClick:arg=>{this._selected=dayKey(arg.date,this._zone());this._load();},
      datesSet:arg=>{this._range={start:arg.startStr,end:arg.endStr};this._load();}
    });
    this._calendar.render();
    this._resize=new ResizeObserver(()=>this._calendar?.updateSize());this._resize.observe(container);
  }
  async _load() {
    if (!this._hass || !this._range || !this.isConnected) return;
    const requestId=++this._requestId,zone=this._zone();
    const tomorrow=shiftDay(this._selected,2,zone);
    const end=DateTime.fromISO(this._range.end,{zone}).toMillis()>DateTime.fromISO(tomorrow,{zone}).toMillis()?this._range.end:DateTime.fromISO(tomorrow,{zone}).toISO();
    this._loading=true;
    const result=await fetchCalendars(this._hass,this._config.entities,{...this._range,end},zone);
    if (requestId!==this._requestId || !this.isConnected) return;
    this._events=result.events;this._failed=result.failed;this._sources=result.sources;this._inventoryFailed=result.inventoryFailed;this._loading=false;this._applyEvents();
  }
  _applyEvents() {
    if (!this._calendar) return;
    this._calendar.batchRendering(()=>{this._calendar.removeAllEvents();this._calendar.addEventSource(this._events.filter(event=>!this._hidden.has(event.extendedProps.source)));});
  }
  _setView(view) {
    // Explicitly anchor each view to the selected date instead of FullCalendar's inferred current range.
    this._view=view;this._calendar?.changeView(VIEWS[view],this._selected);
  }
  _navigate(delta) {
    const date=DateTime.fromISO(this._selected,{zone:this._zone()}).plus(this._view==='month'?{months:delta}:this._view==='week'?{weeks:delta}:{days:delta});
    this._selected=date.toISODate();this._calendar?.gotoDate(this._selected);
  }
  _today() {this._selected=dayKey(new Date(),this._zone());this._calendar?.gotoDate(this._selected);}
  _toggle(entity) {const hidden=new Set(this._hidden);hidden.has(entity)?hidden.delete(entity):hidden.add(entity);this._hidden=hidden;this._applyEvents();}
  _openEvent(id) {this._detail=this._events.find(event=>event.id===id);this.updateComplete.then(()=>this.renderRoot.querySelector('dialog')?.showModal());}
  _closeDetail() {this.renderRoot.querySelector('dialog')?.close();this._detail=null;}
  _time(event) {if(event.allDay)return 'Весь день';return DateTime.fromMillis(event.startMs,{zone:this._zone()}).toFormat('HH:mm');}
  _dateTitle() {
    const day=DateTime.fromISO(this._selected,{zone:this._zone()}).setLocale(this._locale());
    if (this._view==='month') return day.toFormat('LLLL yyyy');
    if (this._view==='week') {const start=day.startOf('week');return `${start.toFormat('d LLL')} — ${start.plus({days:6}).toFormat('d LLL yyyy')}`;}
    return day.toFormat('cccc, d MMMM yyyy');
  }
  _agenda(key,label) {
    const events=eventsOnDay(this._events.filter(e=>!this._hidden.has(e.extendedProps.source)),key,this._zone());
    const failed=this._failed.filter(entity=>!this._hidden.has(entity));
    return html`<section class="agenda-section"><h3>${label}</h3>${events.length?events.map(event=>html`
      <button class="agenda-event ${event.endMs<Date.now()?'past':''}" @click=${()=>this._openEvent(event.id)}>
        <span class="event-time">${this._time(event)}${event.allDay?nothing:html`<small>${DateTime.fromMillis(event.endMs,{zone:this._zone()}).toFormat('HH:mm')}</small>`}</span>
        <span class="event-copy" style=${`border-color:${event.extendedProps.color}`}><strong>${event.title}</strong><small>${this._name(event.extendedProps.source)}</small></span><ha-icon icon="mdi:chevron-right"></ha-icon>
      </button>`):html`<p class="empty">${this._loading?'Загружаю события…':failed.length?'События части календарей недоступны':'Нет событий'}</p>`}</section>`;
  }
  _dialog() {
    const event=this._detail;if(!event)return nothing;
    return html`<dialog @cancel=${()=>{this._detail=null;}} @click=${e=>{if(e.target===e.currentTarget)this._closeDetail();}}>
      <header><h2>${event.title}</h2><button aria-label="Закрыть событие" @click=${this._closeDetail}><ha-icon icon="mdi:close"></ha-icon></button></header>
      <p class="source-name" style=${`color:${event.extendedProps.color}`}>${this._name(event.extendedProps.source)}</p>
      <p>${DateTime.fromMillis(event.startMs,{zone:this._zone()}).setLocale(this._locale()).toFormat('cccc, d MMMM yyyy')} · ${this._time(event)}${event.allDay?'':` — ${DateTime.fromMillis(event.endMs,{zone:this._zone()}).toFormat('HH:mm')}`}</p>
      ${event.extendedProps.location?html`<p><ha-icon icon="mdi:map-marker-outline"></ha-icon> ${event.extendedProps.location}</p>`:nothing}
      ${event.extendedProps.description?html`<p class="description">${event.extendedProps.description}</p>`:nothing}
    </dialog>`;
  }
  render() {
    if (!this._config)return nothing;
    const tomorrow=shiftDay(this._selected,1,this._zone());
    return html`<ha-card><div class="workspace">
      <main><header class="calendar-header"><h2>${this._dateTitle()}</h2><nav aria-label="Дата календаря">
        <button aria-label="Предыдущий период" @click=${()=>this._navigate(-1)}><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <button @click=${this._today}>Сегодня</button><button aria-label="Следующий период" @click=${()=>this._navigate(1)}><ha-icon icon="mdi:chevron-right"></ha-icon></button></nav></header>
        <div class="sources" role="group" aria-label="Календари">${this._sources.map(source=>html`<button class="source" aria-pressed=${String(!this._hidden.has(source.entity))} @click=${()=>this._toggle(source.entity)}>
          <ha-icon icon=${this._hidden.has(source.entity)?'mdi:checkbox-blank-outline':'mdi:checkbox-marked'} style=${`color:${source.color}`}></ha-icon><span>${this._name(source.entity)}</span></button>`)}</div>
        ${this._failed.length?html`<div class="error" role="status">Не удалось загрузить: ${this._failed.map(entity=>this._name(entity)).join(', ')} <button @click=${this._load}>Повторить</button></div>`:nothing}
        ${this._inventoryFailed?html`<div class="error" role="status">Не удалось обновить список календарей <button @click=${this._load}>Повторить</button></div>`:nothing}
        ${!this._sources.length && !this._loading?html`<p class="empty">Нет подключённых календарей</p>`:nothing}
        <div id="calendar" aria-label="Сетка календаря" aria-busy=${String(this._loading)}></div>
      </main>
      <aside><div class="view-switch" role="group" aria-label="Вид календаря">${Object.keys(VIEWS).map(view=>html`<button aria-pressed=${String(view===this._view)} @click=${()=>this._setView(view)}>${{day:'День',week:'Неделя',month:'Месяц'}[view]}</button>`)}</div>
        <div class="agenda-scroll">${this._agenda(this._selected,this._selected===dayKey(new Date(),this._zone())?'Сегодня':DateTime.fromISO(this._selected,{zone:this._zone()}).setLocale(this._locale()).toFormat('d MMMM'))}
        ${this._agenda(tomorrow,`Следующий день · ${DateTime.fromISO(tomorrow,{zone:this._zone()}).setLocale(this._locale()).toFormat('d MMMM')}`)}</div>
      </aside></div>${this._dialog()}</ha-card>`;
  }
  getCardSize() {return 8;}
  getGridOptions() {return {columns:24,rows:8,min_columns:12,min_rows:6};}
  static getStubConfig(hass) {return {entities:Object.keys(hass.states).filter(entity=>entity.startsWith('calendar.')).slice(0,4),default_view:'day'};}
}

if (!customElements.get('belovodie-calendar-card')) customElements.define('belovodie-calendar-card',BelovodieCalendarCard);
window.customCards=window.customCards || [];
window.customCards.push({type:'belovodie-calendar-card',name:'Belovodie Calendar',description:'Day, week and month with a shared date, source filters and event details.'});
console.info(`Belovodie Calendar Card ${__VERSION__}`);
