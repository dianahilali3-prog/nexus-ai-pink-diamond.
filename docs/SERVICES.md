# Services gratuits utilisés — vérifications réelles

Vérifié le 13 novembre 2026 par des requêtes réelles (en-tête `Origin: https://dianahilali3-prog.github.io`) et lecture des conditions d'utilisation en vigueur. Ces services peuvent changer à tout moment.

| Service | Usage dans NEXUS | Clé ? | CORS depuis github.io | Limites constatées / annoncées |
|---|---|---|---|---|
| Pollinations texte `text.pollinations.ai/openai` | Chat par défaut (streaming) | Non | Oui (`*`) | Un seul modèle sans clé : **GPT-OSS 20B** (modèle « à raisonnement »). File partagée, cadence limitée. Refusé depuis `localhost` (« Missing Turnstile token »). |
| Pollinations image `image.pollinations.ai` | Images par défaut | Non | Oui (`*`) | Modèle sans clé : **Sana**. 10–60 s par image. Option `private=true` utilisée. |
| Pollinations `gen.pollinations.ai` | Chat/images/vidéos avancés | Oui (`sk_…`) | Oui | Consomme du **Pollen** (crédit : quêtes/bonus gratuits ou payant). Liste des modèles sans clé. |
| OpenRouter | Chat (modèles `:free`) | Oui (gratuite) | Oui (`*`) | ~20 req/min, quota quotidien limité. 13 modèles `:free` listés ce jour. |
| Groq | Chat rapide | Oui (gratuite) | Oui (`*`) | Limites par minute/jour selon le modèle. |
| Hugging Face (fichiers de modèles) | IA locale, Whisper, description d'image | Non | Oui | Téléchargement unique, mis en cache. |
| Espace HF FLUX.1 schnell | Images (secours) | Facultative (jeton HF gratuit) | Oui | **ZeroGPU** : quota GPU quotidien par personne. Depuis un serveur de centre de données : quota 0 (« ZeroGPU quota exceeded »). |
| Espace HF LTX-Video distilled | Vidéo IA (bêta) | Facultative | Oui | Même quota ZeroGPU. Non vérifiable depuis mon serveur (quota 0). |
| Wikipédia API | Recherche web | Non | Oui (`origin=*`) | Usage raisonnable, en-tête `Api-User-Agent` envoyé. |
| Jina Reader `r.jina.ai` | Lecture des liens | Non | Oui | **20 requêtes/minute** sans clé (`x-ratelimit-limit`). `s.jina.ai` (recherche) exige une clé : non utilisé. |
| DuckDuckGo | — | — | — | **Non utilisé** : sa politique interdit d'afficher ses résultats dans un autre service. |
| jsDelivr / cdnjs | Moteur de la voix Piper | Non | Oui | Téléchargement unique. |

## Constats faits sur le site en ligne (github.io)
- Le chat Pollinations sans clé répond depuis `https://dianahilali3-prog.github.io` (pas de blocage anti-robot), mais **refuse les requêtes simultanées** : le refus arrive sans en-tête CORS et ressemble à une coupure réseau. NEXUS envoie donc une seule requête à la fois et réessaie deux fois avant de basculer.
- GPT-OSS 20B est un modèle « à raisonnement » : sans `reasoning_effort`, il peut épuiser sa limite (« output_token_limit_exceeded ») sur les tâches longues. NEXUS utilise `low` pour storyboard, titres et prompts, `medium` pour le chat.
- Images sans clé : des demandes trop rapprochées reçoivent « 402 » en 0,3 s (limite de cadence, pas un vrai paiement) ; un prompt contenant « ; » échoue immédiatement ; un prompt d'environ 90 mots est refusé. NEXUS espace les images (3 s), réessaie après 8/20/40 s, retire les caractères spéciaux et limite le prompt à ~380 caractères.
- Depuis `localhost`, Pollinations exige un jeton Cloudflare Turnstile : les tests locaux du chat ne sont pas représentatifs (il faut tester sur github.io).

## Conditions d'utilisation lues
- **Pollinations** (mise à jour du 10/10/2026) : service « tel quel », sans garantie ni SLA ; limites et modèles modifiables ; interdits notamment : deepfakes de personnes réelles sans consentement, contenus illégaux, contournement des limites.
- **Hugging Face ZeroGPU** : usage gratuit pour tous avec quota quotidien ; les comptes PRO ont 8× plus de quota.
- **Jina AI** : conditions générales d'Elastic/Jina ; l'API Reader sans clé est proposée publiquement avec limite de débit.
- **DuckDuckGo** : la politique d'usage acceptable interdit d'« encadrer ou afficher une partie des services dans un autre service » → exclu.

## Vidéo réellement gratuite ?
- Les modèles vidéo open source (Wan 2.x, LTX-Video) demandent un GPU (Wan 2.2 TI2V-5B : ~24 Go de VRAM). Impossible sur téléphone.
- Gratuit en ligne : uniquement via les espaces Hugging Face ZeroGPU, avec un quota quotidien faible, des files d'attente et des espaces parfois en veille. Intégré en **bêta**, avec messages d'erreur clairs.
- Fiable et gratuit : le **montage vidéo dans le navigateur** à partir des images générées (mode « Projet → vidéo »).
