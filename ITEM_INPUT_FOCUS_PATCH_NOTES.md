# Item input focus patch

Fixes a custom inventory item issue where typing in the item name/title field could trigger a sort/filter rebuild after every letter. On desktop and mobile, that could cause the field to lose focus, forcing the user to tap/click it again for each character.

The item name now updates the row summary and equipped-item dropdowns while typing, but inventory sorting/filtering is only committed when the field changes/blurs or when Enter is pressed.
