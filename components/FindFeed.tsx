"use client";

import { Eraser, ExternalLink, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { imageSrc } from "@/lib/client";
import { clock, everyText, formatKm, moment } from "@/lib/format";
import type { Find } from "@/lib/types";
import type { Run } from "./SniperApp";

interface Props {
  finds: Find[];
  hasSearches: boolean;
  intervalMin: number;
  now: number;
  seenUntil: number;
  mountedAt: number;
  busy: ReadonlySet<string>;
  run: Run;
  onAddSearch: () => void;
}

export default function FindFeed({ finds, hasSearches, intervalMin, now, seenUntil, mountedAt, busy, run, onAddSearch }: Props) {
  const clear = () => {
    if (window.confirm("Alle vondsten uit de lijst halen?")) void run("clear", "/api/finds", "DELETE");
  };

  return (
    <>
      <div className="feed-head">
        <div>
          <h1 className="feed-title">
            Gevonden <span className="feed-count">{finds.length}</span>
          </h1>
          <p className="feed-sub">
            {finds.length
              ? `Laatste vondst om ${clock(finds[0].foundAt)}. Nieuwste bovenaan.`
              : hasSearches
                ? "Alles wat er al stond is overgeslagen. Wat er nu bijkomt en past, verschijnt hier."
                : "Hier verschijnen nieuwe advertenties die bij je zoekopdrachten passen."}
          </p>
        </div>
        {finds.length > 0 && (
          <button type="button" className="btn quiet" onClick={clear} disabled={busy.has("clear")}>
            <Eraser aria-hidden="true" />
            Lijst leegmaken
          </button>
        )}
      </div>

      {finds.length === 0 ? (
        <div className="empty-feed">
          <div className="empty-tag" aria-hidden="true">
            <strong>€ ?</strong>
          </div>
          <div>
            <h2>{hasSearches ? "Nog niets nieuws binnen" : "Nog geen zoekopdracht"}</h2>
            <p>
              {hasSearches
                ? `De app kijkt ${everyText(intervalMin)}. Zodra er een advertentie bijkomt die past, hangt hij hier met prijskaartje en al.`
                : `Vul een zoekterm, je postcode, een maximale afstand en een maximale prijs in. Daarna kijkt de app ${everyText(intervalMin)} voor je mee.`}
            </p>
            {!hasSearches && (
              <button type="button" className="btn primary" onClick={onAddSearch}>
                <Plus aria-hidden="true" />
                Zoekopdracht toevoegen
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className="finds">
          {finds.map((find) => (
            <FindCard
              key={find.key}
              find={find}
              now={now}
              isNew={find.foundAt > seenUntil}
              arrived={find.foundAt > mountedAt}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function FindCard({ find, now, isNew, arrived }: { find: Find; now: number; isNew: boolean; arrived: boolean }) {
  const [broken, setBroken] = useState(false);
  const price = find.priceNote ? `${find.priceNote} ${find.priceLabel}` : find.priceLabel;

  return (
    <li className={`find${isNew ? " is-new" : ""}${arrived ? " arrived" : ""}`}>
      <div className="find-media">
        <a className="find-photo" href={find.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
          {find.image && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element -- bewust geen next/image: foto's moeten via de proxy
            <img src={imageSrc(find.image)} alt="" loading="lazy" onError={() => setBroken(true)} />
          ) : (
            <span className="no-photo">Geen foto</span>
          )}
        </a>
        <div className="tag" aria-label={`Prijs: ${price}`}>
          {find.priceNote && <small>{find.priceNote}</small>}
          <strong>{find.priceLabel}</strong>
        </div>
      </div>
      <div className="find-body">
        <h3>
          <a href={find.url} target="_blank" rel="noopener noreferrer">
            {find.title}
          </a>
        </h3>
        <p className="find-where">
          <MapPin aria-hidden="true" />
          <span>
            {find.city || "Onbekende plaats"}
            {find.distanceM !== null && `, ${formatKm(find.distanceM)} km`}
          </span>
        </p>
        {find.description && <p className="find-desc">{find.description}</p>}
      </div>
      <div className="find-foot">
        <span className="find-when">
          {isNew && <span className="new-label">Nieuw</span>}
          {moment(find.foundAt, now)} via “{find.query}”
        </span>
        <a className="find-open" href={find.url} target="_blank" rel="noopener noreferrer">
          Bekijk advertentie
          <ExternalLink aria-hidden="true" />
        </a>
      </div>
    </li>
  );
}
