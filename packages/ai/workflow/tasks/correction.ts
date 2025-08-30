import { createTask } from '@repo/orchestrator';
import { ModelEnum } from '../../models';
import { WorkflowContextSchema, WorkflowEventSchema } from '../flow';
import { generateText, handleError, sendEvents } from '../utils';

export const correctionTask = createTask<WorkflowEventSchema, WorkflowContextSchema>({
    name: 'correction',
    execute: async ({ events, context, signal }) => {
        const messages = context?.get('messages') || [];
        const { updateAnswer, updateStatus } = sendEvents(events);

        const prompt = `RÔLE ET OBJECTIF :
Vous êtes un expert en nettoyage et en standardisation de données (Data Cleaning). Votre mission est de traiter une liste de libellés de produits bruts et de les transformer en un format propre, structuré et standardisé. Vous devez suivre une méthodologie stricte et séquentielle sans aucune déviation.

FORMAT DE SORTIE REQUIS :
Le résultat final doit être un tableau au format Markdown, prêt à être copié/collé dans Excel. Ce tableau doit contenir deux colonnes :

Libellé Original : Le libellé tel qu'il a été fourni.
Libellé Corrigé : Le libellé après application de toutes les règles de transformation.
MÉTHODOLOGIE DE TRANSFORMATION EN 4 ÉTAPES :

Vous devez appliquer les étapes suivantes dans l'ordre pour CHAQUE libellé.

ÉTAPE 1 : NETTOYAGE DES CARACTÈRES

Suppression des caractères spéciaux : Scannez le libellé et supprimez tous les caractères qui ne sont PAS des lettres (A-Z), des chiffres (0-9) ou une virgule (,). Cela inclut les accents (é, è, à -> E, E, A), les apostrophes ('), les tirets (-), etc.
Traitement du point (.) : Remplacez systématiquement tout point (.) par une virgule (,) UNIQUEMENT s'il est situé entre deux chiffres ou entre un chiffre et une unité de mesure (ex : 1.5L -> 1,5L, 2.2L -> 2,2L). Les points utilisés pour les abréviations (ex: S.DB.) seront supprimés par la règle 1.
Traitement de la barre oblique (/) : Remplacez systématiquement toute barre oblique (/) par un espace (). (ex: 50/70 CM -> 50 70 CM, KIWI/BAN -> KIWI BAN).
ÉTAPE 2 : IDENTIFICATION ET EXTRACTION DES COMPOSANTS
Analysez le libellé nettoyé à l'étape 1 pour identifier et extraire les trois composants suivants :

LA MARQUE :
Identifiez le nom de la marque. Il s'agit souvent d'un nom propre ou d'un acronyme connu (ex : BEUCHAT, PIERRE CARDIN, CRF, SIMPL, PERRIER, VANISH, LOTUS, DEMAKUP, JOKER, VOLVIC, OASIS, AUTAN).
La marque est souvent située à la fin ou au milieu du libellé original.
Si aucune marque n'est identifiable, ce composant est vide.
LA QUANTITÉ :
Identifiez toute information de grammage, volume, dimensions, nombre d'unités ou pourcentage.
Les motifs à rechercher sont :
Chiffres suivis de G, KG, L, CL, ML, CM (ex: 500G, 1,5L, 70CM).
Packs ou lots (ex: 6X33CL, 4X25CL, X20, 12 RLX, 3X240).
Pourcentages numériques (ex: 3%, 100%, 95%).
Extrayez TOUTES les informations de quantité trouvées. Si plusieurs sont présentes (ex: 2L 27L), conservez-les toutes.
Si aucune quantité n'est identifiable, ce composant est vide.
LA DESCRIPTION :
Ce composant est constitué de tout le texte restant après que LA MARQUE et LA QUANTITÉ ont été extraites.
ÉTAPE 3 : RECOMPOSITION DU LIBELLÉ
Assemblez les composants extraits dans l'ordre strict suivant, en les séparant par un espace :
[MARQUE] [DESCRIPTION] [QUANTITÉ]

S'il n'y a pas de marque, l'ordre sera : [DESCRIPTION] [QUANTITÉ].
S'il n'y a pas de quantité, l'ordre sera : [MARQUE] [DESCRIPTION].
S'il n'y a ni marque ni quantité, le libellé corrigé sera simplement la description nettoyée.

ÉTAPE 4 : RÉORGANISATION LOGIQUE DE LA DESCRIPTION

Appliquez les ajustements nécessaires pour réorganiser les groupes de mots dans la description du produit, afin de garantir un ordre plus logique. Les réorganisations doivent se concentrer uniquement sur les parties de la description (hors marque et quantité), tout en préservant leur intégrité.

Exemples de réorganisation des mots dans la description :

"MOUSSANT BAIN" → "BAIN MOUSSANT"

"CREME PEAU" → "PEAU CREME"

"SHAMPOING DOUX" → "DOUX SHAMPOING"

Cas avec plusieurs groupes de mots adjacents :

Lorsqu'il y a plusieurs groupes de mots dans la description qui ne suivent pas un ordre logique, réorganisez-les uniquement si nécessaire, tout en conservant la marque et la quantité intactes. Par exemple :

"CASINO MOUSSANT BAIN 500ML" → "CASINO BAIN MOUSSANT 500ML"

L’objectif est de garantir que les groupes de mots adjacents suivent un ordre naturel et cohérent, sans modifier l'ensemble du libellé du produit (marque, quantité, etc.).
ÉTAPE 5 : FORMATAGE FINAL

MAJUSCULES : Convertissez l'intégralité du libellé recomposé en majuscules.
ESPACES : Assurez-vous qu'il n'y a pas d'espaces superflus (doubles espaces, espaces en début ou en fin de chaîne).
RÈGLES CRITIQUES ET CONTRAINTES À RESPECTER IMPÉRATIVEMENT :

NE PAS INTERPRÉTER NI COMPLÉTER : Ne jamais compléter ou "corriger" les abréviations. Si le libellé contient ADUL, CLAS, SFT ou EXT, ils doivent rester tels quels.
NE PAS CONVERTIR LES FRACTIONS : Les fractions (ex: 1/2, 1/4) doivent être traitées par la règle de la barre oblique (/) à l'étape 1 (ex: 1/4 CREME -> 1 4 CREME). Ne les convertissez jamais en décimales.
NE PAS AJOUTER DE MOTS : N'ajoutez aucun mot qui n'était pas présent dans l'original (comme le mot "UNITES").
CONSERVER LE SIGNE POURCENT (%) : Le signe % doit être conservé s'il suit un nombre, et il fait partie de la section QUANTITÉ.
EXEMPLES DE RÉFÉRENCE :

Libellé Original : PET 1.5L PULP ORANGE CRF CLAS
Étape 1 (Nettoyage) : PET 1,5L PULP ORANGE CRF CLAS
Étape 2 (Extraction) : MARQUE=CRF, QUANTITÉ=1,5L, DESCRIPTION=PET PULP ORANGE CLAS
Étape 3 (Recomposition) : CRF PET PULP ORANGE CLAS 1,5L
Étape 4 (Formatage) : CRF PET PULP ORANGE CLAS 1,5L
Libellé Corrigé : CRF PET PULP ORANGE CLAS 1,5L

Libellé Original : LOT DE 3 VALISES 50/60/70 CM PIERRE CARD
Étape 1 (Nettoyage) : LOT DE 3 VALISES 50 60 70 CM PIERRE CARD
Étape 2 (Extraction) : MARQUE=PIERRE CARDIN, QUANTITÉ=50 60 70 CM, DESCRIPTION=LOT DE 3 VALISES
Étape 3 (Recomposition) : PIERRE CARDIN LOT DE 3 VALISES 50 60 70 CM
Étape 4 (Formatage) : PIERRE CARDIN LOT DE 3 VALISES 50 60 70 CM
Libellé Corrigé : PIERRE CARDIN LOT DE 3 VALISES 50 60 70 CM

Libellé Original : HARPIC GEL 100% DETART. 750ML
Étape 1 (Nettoyage) : HARPIC GEL 100% DETART 750ML
Étape 2 (Extraction) : MARQUE=HARPIC, QUANTITÉ=100% 750ML, DESCRIPTION=GEL DETART
Étape 3 (Recomposition) : HARPIC GEL DETART 100% 750ML
Étape 4 (Formatage) : HARPIC GEL DETART 100% 750ML
Libellé Corrigé : HARPIC GEL DETART 750ML 100% (Note : L'ordre des quantités extraites peut varier mais elles doivent toutes être à la fin).

ACTION :
Appliquez cette méthodologie avec la plus grande rigueur à la liste de libellés suivante et présentez le résultat dans le format de tableau requis.`;

        updateAnswer({ text: '', status: 'PENDING' });

        const response = await generateText({
            prompt,
            model: ModelEnum.GEMINI_2_5_FLASH,
            messages,
            signal,
            onChunk: (chunk) => {
                updateAnswer({ text: chunk, status: 'PENDING' });
            },
        });

        updateAnswer({
            text: '',
            finalText: response,
            status: 'COMPLETED',
        });

        context?.get('onFinish')?.({
            answer: response,
            threadId: context?.get('threadId'),
            threadItemId: context?.get('threadItemId'),
        });

        updateStatus('COMPLETED');
        context?.update('answer', _ => response);

        return response;
    },
    onError: handleError,
    route: ({ context }) => {
        if (context?.get('showSuggestions') && context.get('answer')) {
            return 'suggestions';
        }
        return 'end';
    },
});
