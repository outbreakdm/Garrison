/**
 * Other languages (best bot item 11). A server picks the language Garrison speaks to its
 * members in (Settings → Server): level-ups, alert headings and buttons, and its public page.
 * Slash commands are described in every language here, and Discord shows each member the one
 * their Discord is set to. The dashboard itself is still English. Pure and shared.
 */

export const LANGUAGES = {
  en: { label: "English", discord: ["en-US", "en-GB"] },
  es: { label: "Español", discord: ["es-ES", "es-419"] },
  pt: { label: "Português (Brasil)", discord: ["pt-BR"] },
  de: { label: "Deutsch", discord: ["de"] },
  fr: { label: "Français", discord: ["fr"] },
} as const;
export type Language = keyof typeof LANGUAGES;
export const LANGUAGE_LIST = Object.keys(LANGUAGES) as Language[];
export const isLanguage = (v: unknown): v is Language =>
  typeof v === "string" && Object.hasOwn(LANGUAGES, v);

type Phrase = Record<Language, string>;

/** What Garrison says to members. {name}-style holes are filled by say(). */
const PHRASES = {
  levelUp: {
    en: "{user} reached level {level}.",
    es: "{user} subió al nivel {level}.",
    pt: "{user} chegou ao nível {level}.",
    de: "{user} hat Level {level} erreicht.",
    fr: "{user} a atteint le niveau {level}.",
  },
  levelUpRoles: {
    en: "{user} reached level {level} and got {roles}.",
    es: "{user} subió al nivel {level} y consiguió {roles}.",
    pt: "{user} chegou ao nível {level} e ganhou {roles}.",
    de: "{user} hat Level {level} erreicht und {roles} bekommen.",
    fr: "{user} a atteint le niveau {level} et obtenu {roles}.",
  },
  liveOn: {
    en: "{name} is live on {site}",
    es: "{name} está en directo en {site}",
    pt: "{name} está ao vivo na {site}",
    de: "{name} ist live auf {site}",
    fr: "{name} est en live sur {site}",
  },
  newVideo: {
    en: "{name} posted a new video",
    es: "{name} subió un vídeo nuevo",
    pt: "{name} postou um vídeo novo",
    de: "{name} hat ein neues Video gepostet",
    fr: "{name} a publié une nouvelle vidéo",
  },
  newInSubreddit: {
    en: "New post in r/{name}",
    es: "Nueva publicación en r/{name}",
    pt: "Nova publicação em r/{name}",
    de: "Neuer Beitrag in r/{name}",
    fr: "Nouveau post dans r/{name}",
  },
  postedOn: {
    en: "{name} posted on {site}",
    es: "{name} publicó en {site}",
    pt: "{name} publicou no {site}",
    de: "{name} hat auf {site} gepostet",
    fr: "{name} a publié sur {site}",
  },
  newFrom: {
    en: "New from {name}",
    es: "Novedad de {name}",
    pt: "Novidade de {name}",
    de: "Neu von {name}",
    fr: "Nouveau de {name}",
  },
  watchOn: {
    en: "Watch on {site}",
    es: "Ver en {site}",
    pt: "Assistir na {site}",
    de: "Auf {site} ansehen",
    fr: "Regarder sur {site}",
  },
  openOn: {
    en: "Open on {site}",
    es: "Abrir en {site}",
    pt: "Abrir no {site}",
    de: "Auf {site} öffnen",
    fr: "Ouvrir sur {site}",
  },
  readIt: { en: "Read it", es: "Leer", pt: "Ler", de: "Lesen", fr: "Lire" },
  members: {
    en: "{count} members on Discord",
    es: "{count} miembros en Discord",
    pt: "{count} membros no Discord",
    de: "{count} Mitglieder auf Discord",
    fr: "{count} membres sur Discord",
  },
  join: {
    en: "Join on Discord",
    es: "Unirse en Discord",
    pt: "Entrar no Discord",
    de: "Auf Discord beitreten",
    fr: "Rejoindre sur Discord",
  },
  leaderboard: {
    en: "Leaderboard",
    es: "Clasificación",
    pt: "Ranking",
    de: "Bestenliste",
    fr: "Classement",
  },
  level: {
    en: "Level {level}",
    es: "Nivel {level}",
    pt: "Nível {level}",
    de: "Level {level}",
    fr: "Niveau {level}",
  },
  noXp: {
    en: "Nobody has earned XP yet.",
    es: "Nadie ha ganado XP todavía.",
    pt: "Ninguém ganhou XP ainda.",
    de: "Noch hat niemand XP gesammelt.",
    fr: "Personne n'a encore gagné d'XP.",
  },
  madeWith: {
    en: "A page made with {garrison}, this server's Discord bot.",
    es: "Una página hecha con {garrison}, el bot de Discord de este servidor.",
    pt: "Uma página feita com {garrison}, o bot de Discord deste servidor.",
    de: "Eine Seite, erstellt mit {garrison}, dem Discord-Bot dieses Servers.",
    fr: "Une page créée avec {garrison}, le bot Discord de ce serveur.",
  },
  aMember: {
    en: "A member",
    es: "Un miembro",
    pt: "Um membro",
    de: "Ein Mitglied",
    fr: "Un membre",
  },
  happyBirthday: {
    en: "Happy birthday, {users}!",
    es: "¡Feliz cumpleaños, {users}!",
    pt: "Feliz aniversário, {users}!",
    de: "Alles Gute zum Geburtstag, {users}!",
    fr: "Joyeux anniversaire, {users} !",
  },
  countWrong: {
    en: "{user} broke the count at {count}: the next number was {expected}. Start again from 1.",
    es: "{user} rompió la cuenta en {count}: tocaba el {expected}. Empezad de nuevo desde 1.",
    pt: "{user} quebrou a contagem em {count}: o próximo era {expected}. Recomecem do 1.",
    de: "{user} hat bei {count} verzählt: {expected} wäre dran gewesen. Fangt wieder bei 1 an.",
    fr: "{user} a cassé le compte à {count} : il fallait {expected}. On recommence à 1.",
  },
  countTwice: {
    en: "{user} counted twice in a row, breaking the count at {count}. Start again from 1.",
    es: "{user} contó dos veces seguidas y rompió la cuenta en {count}. Empezad de nuevo desde 1.",
    pt: "{user} contou duas vezes seguidas e quebrou a contagem em {count}. Recomecem do 1.",
    de: "{user} hat zweimal hintereinander gezählt und bei {count} verzählt. Fangt wieder bei 1 an.",
    fr: "{user} a compté deux fois de suite et cassé le compte à {count}. On recommence à 1.",
  },
} satisfies Record<string, Phrase>;
export type PhraseKey = keyof typeof PHRASES;

/** A phrase in a language, its holes filled. Values are put in as given: clean them first. */
export function say(lang: Language, key: PhraseKey, values: Record<string, string | number> = {}) {
  return PHRASES[key][lang].replace(/\{(\w+)\}/g, (hole, k: string) =>
    k in values ? String(values[k]) : hole,
  );
}

/** Each slash command's description in the other languages (English is the command's own). */
export const COMMAND_DESCRIPTIONS: Record<string, Omit<Phrase, "en">> = {
  warn: {
    es: "Advierte a un miembro. Las advertencias cuentan para las sanciones automáticas.",
    pt: "Advertir um membro. As advertências contam para as punições automáticas.",
    de: "Verwarne ein Mitglied. Verwarnungen zählen für automatische Strafen.",
    fr: "Avertir un membre. Les avertissements comptent pour les sanctions automatiques.",
  },
  timeout: {
    es: "Aísla a un miembro para que no pueda chatear ni entrar en voz.",
    pt: "Silenciar um membro para que não possa conversar nem entrar em voz.",
    de: "Schalte ein Mitglied stumm, damit es nicht chatten oder Voice beitreten kann.",
    fr: "Exclure temporairement un membre du chat et du vocal.",
  },
  kick: {
    es: "Expulsa a un miembro del servidor. Puede volver con una invitación.",
    pt: "Expulsar um membro do servidor. Ele pode voltar com um convite.",
    de: "Entferne ein Mitglied vom Server. Mit einer Einladung kann es zurück.",
    fr: "Expulser un membre du serveur. Il peut revenir avec une invitation.",
  },
  ban: {
    es: "Banea a un usuario, esté o no en el servidor.",
    pt: "Banir um usuário, esteja ou não no servidor.",
    de: "Banne einen Nutzer, ob er auf dem Server ist oder nicht.",
    fr: "Bannir un utilisateur, qu'il soit sur le serveur ou non.",
  },
  purge: {
    es: "Borra en bloque los mensajes recientes de este canal.",
    pt: "Apagar em massa as mensagens recentes deste canal.",
    de: "Lösche die letzten Nachrichten in diesem Kanal auf einmal.",
    fr: "Supprimer en masse les messages récents de ce salon.",
  },
  case: {
    es: "Busca un caso de moderación por su número.",
    pt: "Procurar um caso de moderação pelo número.",
    de: "Suche einen Moderationsfall nach Nummer.",
    fr: "Retrouver un dossier de modération par son numéro.",
  },
  history: {
    es: "Muestra los casos de moderación recientes de un miembro.",
    pt: "Mostrar os casos de moderação recentes de um membro.",
    de: "Zeige die letzten Moderationsfälle eines Mitglieds.",
    fr: "Afficher les dossiers de modération récents d'un membre.",
  },
  moderation: {
    es: "Mira o cambia los ajustes de moderación de este servidor.",
    pt: "Ver ou mudar as configurações de moderação deste servidor.",
    de: "Moderationseinstellungen dieses Servers ansehen oder ändern.",
    fr: "Voir ou modifier les réglages de modération de ce serveur.",
  },
  note: {
    es: "Guarda notas privadas del staff sobre un miembro.",
    pt: "Guardar notas privadas da equipe sobre um membro.",
    de: "Private Team-Notizen zu einem Mitglied führen.",
    fr: "Garder des notes privées du staff sur un membre.",
  },
  lockdown: {
    es: "Impide publicar y pausa las invitaciones mientras gestionas un raid.",
    pt: "Impedir postagens e pausar convites enquanto você lida com um raid.",
    de: "Stoppe Nachrichten und pausiere Einladungen, während du einen Raid abwehrst.",
    fr: "Bloquer les messages et suspendre les invitations pendant un raid.",
  },
  verify: {
    es: "Configura el botón de verificación que deja entrar a los nuevos miembros.",
    pt: "Configurar o botão de verificação que libera novos membros.",
    de: "Richte den Verifizierungsknopf ein, der neue Mitglieder hereinlässt.",
    fr: "Configurer le bouton de vérification qui laisse entrer les nouveaux membres.",
  },
  security: {
    es: "Mira o cambia la seguridad: anti-raid, alertas y roles del staff.",
    pt: "Ver ou mudar a segurança: anti-raid, alertas e cargos da equipe.",
    de: "Sicherheit ansehen oder ändern: Anti-Raid, Warnungen und Team-Rollen.",
    fr: "Voir ou modifier la sécurité : anti-raid, alertes et rôles du staff.",
  },
  balance: {
    es: "Mira tu saldo o el de otro miembro.",
    pt: "Ver o seu saldo ou o de outro membro.",
    de: "Sieh dein Guthaben oder das eines anderen Mitglieds.",
    fr: "Voir ton solde ou celui d'un autre membre.",
  },
  daily: {
    es: "Reclama las monedas de hoy.",
    pt: "Resgatar as moedas de hoje.",
    de: "Hol dir die Münzen von heute.",
    fr: "Récupérer les pièces du jour.",
  },
  pay: {
    es: "Paga a otro miembro.",
    pt: "Pagar outro membro.",
    de: "Bezahle ein anderes Mitglied.",
    fr: "Payer un autre membre.",
  },
  shop: {
    es: "Mira lo que vende la tienda del servidor.",
    pt: "Ver o que a loja do servidor vende.",
    de: "Sieh dir an, was der Shop des Servers verkauft.",
    fr: "Voir ce que vend la boutique du serveur.",
  },
  buy: {
    es: "Compra algo en la tienda.",
    pt: "Comprar algo na loja.",
    de: "Kaufe etwas im Shop.",
    fr: "Acheter quelque chose dans la boutique.",
  },
  money: {
    es: "Da o quita monedas, con un motivo.",
    pt: "Dar ou tirar moedas, com um motivo.",
    de: "Münzen geben oder abziehen, mit Begründung.",
    fr: "Donner ou retirer des pièces, avec une raison.",
  },
  health: {
    es: "Revisa los permisos, la posición del rol y los ajustes de Garrison aquí.",
    pt: "Verificar as permissões, a posição do cargo e as configurações do Garrison aqui.",
    de: "Prüfe Garrisons Rechte, Rollenposition und Einstellungen auf diesem Server.",
    fr: "Vérifier les permissions, la position du rôle et les réglages de Garrison ici.",
  },
  lfg: {
    es: "Busca grupo: publica una tarjeta a la que otros pueden unirse.",
    pt: "Procurar grupo: poste um cartão que outros podem entrar.",
    de: "Finde eine Gruppe: Poste eine Karte, der andere beitreten können.",
    fr: "Trouver un groupe : publier une carte que d'autres peuvent rejoindre.",
  },
  raid: {
    es: "Programa raids y eventos con inscripciones por rol y suplentes.",
    pt: "Agendar raids e eventos com inscrição por função e reservas.",
    de: "Plane Raids und Events mit Rollen-Anmeldung und Ersatzbank.",
    fr: "Planifier des raids et événements avec inscriptions par rôle et remplaçants.",
  },
  rank: {
    es: "Muestra tu nivel y XP, o los de otra persona.",
    pt: "Mostrar o seu nível e XP, ou os de outra pessoa.",
    de: "Zeige dein Level und deine XP oder die von jemand anderem.",
    fr: "Afficher ton niveau et ton XP, ou ceux de quelqu'un d'autre.",
  },
  leaderboard: {
    es: "Muestra el top 10 del servidor por XP o por monedas.",
    pt: "Mostrar o top 10 do servidor por XP ou por moedas.",
    de: "Zeige die Top 10 des Servers nach XP oder Münzen.",
    fr: "Afficher le top 10 du serveur en XP ou en pièces.",
  },
  ranks: {
    es: "Configura los niveles: actívalos, los anuncios y las recompensas.",
    pt: "Configurar níveis: ativar, anúncios e recompensas.",
    de: "Richte das Level-System ein: an, Ankündigungen und Belohnungen.",
    fr: "Configurer les niveaux : activation, annonces et récompenses.",
  },
  rankcard: {
    es: "Rellena los detalles de tu tarjeta de rango.",
    pt: "Preencher os detalhes do seu cartão de nível.",
    de: "Fülle die Angaben auf deiner Rangkarte aus.",
    fr: "Remplir les détails de ta carte de rang.",
  },
  logs: {
    es: "Busca en el registro de eventos o elige dónde se publican.",
    pt: "Pesquisar o registro de eventos ou escolher onde são postados.",
    de: "Durchsuche das Ereignisprotokoll oder wähle, wo es gepostet wird.",
    fr: "Chercher dans le journal des événements ou choisir où il est publié.",
  },
  qm: {
    es: "Asistente de IA: describe canales y roles, revisa el plan y créalo.",
    pt: "Assistente de IA: descreva canais e cargos, revise o plano e crie.",
    de: "KI-Assistent: Kanäle und Rollen beschreiben, Plan prüfen, dann bauen.",
    fr: "Assistant IA : décris salons et rôles, vérifie le plan, puis construis-le.",
  },
  link: {
    es: "Vincula tus cuentas de juego y elige si se ven en este servidor.",
    pt: "Vincule suas contas de jogo e escolha se aparecem neste servidor.",
    de: "Verknüpfe deine Spielkonten und wähle, ob dieser Server sie zeigt.",
    fr: "Lier tes comptes de jeu et choisir s'ils s'affichent sur ce serveur.",
  },
  unlink: {
    es: "Quita una cuenta de juego vinculada.",
    pt: "Remover uma conta de jogo vinculada.",
    de: "Entferne ein verknüpftes Spielkonto.",
    fr: "Retirer un compte de jeu lié.",
  },
  roster: {
    es: "Tus personajes de raid, el roster de un equipo y las cuentas compartidas.",
    pt: "Seus personagens de raide, o roster de uma equipe e as contas compartilhadas.",
    de: "Deine Raid-Charaktere, der Kader eines Teams und geteilte Spielkonten.",
    fr: "Tes personnages de raid, le roster d'une équipe et les comptes partagés.",
  },
  access: {
    es: "Lo que puedes abrir en el panel de Garrison de este servidor.",
    pt: "O que você pode abrir no painel do Garrison deste servidor.",
    de: "Was du im Garrison-Dashboard dieses Servers öffnen kannst.",
    fr: "Ce que tu peux ouvrir sur le tableau de bord Garrison de ce serveur.",
  },
  ticket: {
    es: "Gestiona el ticket de este canal.",
    pt: "Trabalhar no ticket deste canal.",
    de: "Bearbeite das Ticket in diesem Kanal.",
    fr: "Gérer le ticket de ce salon.",
  },
  giveaway: {
    es: "Organiza sorteos.",
    pt: "Fazer sorteios.",
    de: "Veranstalte Gewinnspiele.",
    fr: "Organiser des concours.",
  },
  suggest: {
    es: "Sugiere una idea para este servidor.",
    pt: "Sugerir uma ideia para este servidor.",
    de: "Schlage eine Idee für diesen Server vor.",
    fr: "Proposer une idée pour ce serveur.",
  },
  tag: {
    es: "Publica una de las respuestas guardadas del servidor.",
    pt: "Postar uma das respostas salvas do servidor.",
    de: "Poste eine der gespeicherten Antworten des Servers.",
    fr: "Publier une des réponses enregistrées du serveur.",
  },
  birthday: {
    es: "Guarda tu cumpleaños para que el servidor lo celebre.",
    pt: "Salve seu aniversário para o servidor comemorar.",
    de: "Speichere deinen Geburtstag, damit der Server ihn feiern kann.",
    fr: "Enregistre ton anniversaire pour que le serveur le fête.",
  },
  trivia: {
    es: "Lanza una pregunta de trivia: gana la primera respuesta correcta.",
    pt: "Faça uma pergunta de trivia: a primeira resposta certa vence.",
    de: "Stelle eine Quizfrage: Die erste richtige Antwort gewinnt.",
    fr: "Poser une question de quiz : la première bonne réponse gagne.",
  },
  temprole: {
    es: "Da un rol a un miembro durante un tiempo.",
    pt: "Dar um cargo a um membro por um tempo.",
    de: "Gib einem Mitglied eine Rolle für eine Weile.",
    fr: "Donner un rôle à un membre pour un temps.",
  },
};

/** Discord's description_localizations for a command: every language's Discord locales. */
export function commandLocalizations(name: string): Record<string, string> | undefined {
  const d = COMMAND_DESCRIPTIONS[name];
  if (!d) return undefined;
  const out: Record<string, string> = {};
  for (const lang of LANGUAGE_LIST)
    if (lang !== "en") for (const locale of LANGUAGES[lang].discord) out[locale] = d[lang];
  return out;
}
