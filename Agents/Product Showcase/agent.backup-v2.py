"""
=============================================================================
AGENT.PY - BACKUP VERSION 2 (STABLE)
=============================================================================
Backup of _handle_get_post_types and _handle_search_references_by_type
Created: 2026-01-31
=============================================================================

To restore: copy the functions below back into agent.py
"""

# BACKUP: _handle_get_post_types (lines 1432-1519)
def _handle_get_post_types_BACKUP(self) -> Dict[str, Any]:
    """
    Step 1: Analyze product, then get recommended post types with example images
    """
    debug_tracker.start_flow(self.product_image_path)
    debug_tracker.log_step("1.0 STEP1_GET_POST_TYPES_START", {
        "product_image": self.product_image_path
    })
    
    try:
        # First, analyze the product image to get name and category
        product_info = self._analyze_product_image()
        product_name = product_info.get('product_name', 'tu producto')
        industry = product_info.get('industry', 'beauty')
        category = product_info.get('category', 'product')
        
        # Store for later use
        self.product_name = product_name
        self.product_industry = industry
        self.product_category = category  # Store product category for reference filtering
        
        debug_tracker.log_step("1.4 FETCHING_POST_TYPES_FROM_DB", {
            "backend_url": self.backend_url,
            "industry": industry,
            "category": category
        })
        
        internal_token = os.environ.get("POSTTY_INTERNAL_TOKEN", "").strip()
        headers = {"Content-Type": "application/json"}
        if internal_token:
            headers["X-Postty-Internal-Token"] = internal_token
        
        response = requests.post(
            f'{self.backend_url}/get-post-types',
            json={
                'productAnalysis': f"{category} {product_name}",
                'industry': industry,
                'limit': 4
            },
            headers=headers,
            timeout=15
        )
        response.raise_for_status()
        result = response.json()
        
        if result.get('status') == 'success' and result.get('postTypes'):
            post_types = result['postTypes']
            self.current_step = 1
            
            # V2: Store FULL example image data for each post type to ensure it appears first in references
            # This is HARDCODED to always show the selected post type image as the first reference
            self.post_type_examples = {}
            for pt in post_types:
                pt_type = pt.get('type')
                example_img = pt.get('exampleImage', {})
                if pt_type and example_img.get('id'):
                    # Store full image data, not just ID
                    self.post_type_examples[pt_type] = {
                        'id': example_img.get('id'),
                        'url': example_img.get('url'),
                        'designGuidelines': example_img.get('designGuidelines', {})
                    }
            
            debug_tracker.log_step("1.5 POST_TYPES_RETRIEVED", {
                "count": len(post_types),
                "types": [pt.get('type') for pt in post_types],
                "example_ids": {k: v.get('id')[:8] if v.get('id') else 'none' for k, v in self.post_type_examples.items()}
            })
            
            return {
                "type": "post_type_options",
                "text": f"¡Excelente Foto! Veo que quieres lograr un post para tu producto de **{product_name}**. Estuve investigando mientras esperabas y estos son los **top tipos de ads para tu producto**, elige alguno para continuar con tu post por favor.",
                "productThumbnail": self.product_image_path,
                "postTypes": post_types
            }
        else:
            debug_tracker.log_step("1.5 POST_TYPES_RETRIEVED", success=False, error="No post types found")
            return {
                "type": "text",
                "text": f"¡Excelente Foto! Veo tu **{product_name}**. No encontré tipos de post en la base de datos. ¿Querés describir qué tipo de imagen te gustaría crear?"
            }
            
    except Exception as e:
        debug_tracker.log_step("1.0 STEP1_GET_POST_TYPES", success=False, error=str(e))
        return {
            "type": "text",
            "text": "Tuve un problema obteniendo los tipos de post. ¿Podés describir qué tipo de imagen te gustaría?"
        }


# BACKUP: _handle_search_references_by_type (lines 1521-1694)
def _handle_search_references_by_type_BACKUP(self, post_type: str) -> Dict[str, Any]:
    """
    =======================================================================
    SEARCH REFERENCES BY TYPE - VERSION 2 (STABLE)
    =======================================================================
    DO NOT EDIT without explicit permission from the user.
    
    Features:
    - Filters by productCategory for precise matching (cream, lipstick, etc.)
    - Normalizes category names (facial cream -> cream)
    - Fallback to industry filter when category has no matches
    - Prioritizes example image from selected post type
    
    Last verified: 2026-01-30
    =======================================================================
    """
    debug_tracker.log_step("2.0 STEP2_SEARCH_REFERENCES_START", {
        "selected_post_type": post_type
    })
    
    try:
        internal_token = os.environ.get("POSTTY_INTERNAL_TOKEN", "").strip()
        headers = {"Content-Type": "application/json"}
        if internal_token:
            headers["X-Postty-Internal-Token"] = internal_token
        
        uid = getattr(self, "user_id", None) or ""
        
        # V2: Use product_category for precise filtering (cream, lipstick, serum, etc.)
        raw_category = self.product_category or "product"
        product_industry = self.product_industry or "beauty"
        
        # V2: Normalize category - map similar terms to DB values
        category_mapping = {
            "facial cream": "cream",
            "face cream": "cream", 
            "moisturizer": "cream",
            "moisturizing cream": "cream",
            "hydrating cream": "cream",
            "skincare cream": "cream",
            "face serum": "serum",
            "facial serum": "serum",
            "lip stick": "lipstick",
            "lip color": "lipstick",
            "fragrance": "perfume",
            "cologne": "perfume",
            "nail lacquer": "nail-polish",
            "nail color": "nail-polish",
        }
        product_category = category_mapping.get(raw_category.lower(), raw_category)
        
        # Search query is generic, filtering is done by productCategory
        search_query = "premium"
        
        debug_tracker.log_step("2.1 CALLING_SEARCH_REFERENCES_API", {
            "post_type_filter": post_type,
            "product_category_filter": product_category,  # V2: Changed from industry
            "search_query": search_query,
            "limit": 20
        })
        
        response = requests.post(
            f'{self.backend_url}/search-references',
            json={
                'query': search_query,
                'postType': post_type,
                'productCategory': product_category,  # V2: Filter by product category (cream, lipstick, etc.)
                'limit': 20,
                'userId': uid
            },
            headers=headers,
            timeout=15
        )
        response.raise_for_status()
        result = response.json()
        
        references = result.get('results', []) if result.get('status') == 'success' else []
        
        # V2: Fallback - if no results with exact category, retry with INDUSTRY filter (not nothing!)
        if len(references) == 0 and product_category != "product":
            debug_tracker.log_step("2.1b FALLBACK_SEARCH_WITH_INDUSTRY", {
                "original_category": product_category,
                "fallback_industry": product_industry,
                "reason": "No results with exact category match, using industry filter"
            })
            
            fallback_response = requests.post(
                f'{self.backend_url}/search-references',
                json={
                    'query': search_query,
                    'postType': post_type,
                    'industry': product_industry,  # FIX: Use industry filter instead of nothing!
                    'limit': 20,
                    'userId': uid
                },
                headers=headers,
                timeout=15
            )
            fallback_response.raise_for_status()
            fallback_result = fallback_response.json()
            references = fallback_result.get('results', []) if fallback_result.get('status') == 'success' else []
        
        # Get label for post type (used in both cases)
        type_labels = {
            'hero-shot': 'Hero Shot',
            'product-on-human': 'Product on human',
            'lifestyle': 'Lifestyle',
            'flat-lay': 'Flat Lay',
            'unboxing': 'Unboxing',
        }
        label = type_labels.get(post_type, post_type.replace('-', ' ').title())
        
        if len(references) > 0:
            self.current_step = 2
            
            # V3: Show search results as-is, WITHOUT forcing post type image first
            # The post type image is only used as fallback when no references found
            
            # Store references for later selection
            self.available_references = references
            
            debug_tracker.log_step("2.2 REFERENCES_RETRIEVED_FROM_S3", {
                "count": len(references),
                "reference_ids": [ref.get('id', 'unknown')[:8] for ref in references[:5]],
                "post_type_image_used": False
            })
            
            return {
                "type": "reference_options",
                "text": f"¡Buena elección! Estos son algunos templates que tengo para crear tu post de **{label}**. Necesito que elijas uno para que trabajemos sobre el mismo o puedes también subir uno de tu preferencia.",
                "references": references
            }
        else:
            # FALLBACK: No references found, use the post type example image as the only reference
            example_data = self.post_type_examples.get(post_type)
            if example_data and example_data.get('id'):
                self.current_step = 2
                
                # Create fallback reference from post type example
                fallback_ref = {
                    'id': example_data.get('id'),
                    'url': example_data.get('url'),
                    'designGuidelines': example_data.get('designGuidelines', {})
                }
                references = [fallback_ref]
                
                # Store for later selection
                self.available_references = references
                
                debug_tracker.log_step("2.2 REFERENCES_FALLBACK_TO_POST_TYPE_IMAGE", {
                    "example_id": example_data.get('id')[:8] if example_data.get('id') else "none",
                    "post_type_image_used": True,
                    "reason": "No references found in search"
                })
                
                return {
                    "type": "reference_options",
                    "text": f"¡Buena elección! Para **{label}** tengo esta referencia. Elegila para trabajar sobre ella o puedes subir una de tu preferencia.",
                    "references": references
                }
            else:
                # No references AND no post type example - return error message
                debug_tracker.log_step("2.2 REFERENCES_RETRIEVED_FROM_S3", success=False, error="No references found and no fallback available")
                return {
                    "type": "text",
                    "text": f"No encontré referencias para este tipo de post. ¿Querés que genere la imagen directamente según tu descripción?"
                }
            
    except Exception as e:
        debug_tracker.log_step("2.0 STEP2_SEARCH_REFERENCES", success=False, error=str(e))
        return {
            "type": "text",
            "text": "Tuve un problema buscando referencias. ¿Querés continuar sin referencia?"
        }
