// GraphQL query and mutation strings for Shopify Online Store navigation menus.
// Kept as plain JS string constants — no codegen, no tooling.
//
// Required Admin API access scopes:
//   read_online_store_navigation
//   write_online_store_navigation

export const QUERY_LIST_MENUS = /* GraphQL */ `
  query ListMenus {
    menus(first: 50) {
      edges {
        node {
          id
          handle
          title
          isDefault
          items {
            id
            title
            type
            url
            resourceId
            items {
              id
              title
              type
              url
              resourceId
              items {
                id
                title
                type
                url
                resourceId
              }
            }
          }
        }
      }
    }
  }
`;

export const MUTATION_CREATE_MENU = /* GraphQL */ `
  mutation MenuCreate(
    $title: String!
    $handle: String!
    $items: [MenuItemCreateInput!]!
  ) {
    menuCreate(title: $title, handle: $handle, items: $items) {
      menu {
        id
        handle
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const MUTATION_UPDATE_MENU = /* GraphQL */ `
  mutation MenuUpdate(
    $id: ID!
    $title: String!
    $handle: String!
    $items: [MenuItemUpdateInput!]!
  ) {
    menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
      menu {
        id
        handle
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const MUTATION_DELETE_MENU = /* GraphQL */ `
  mutation MenuDelete($id: ID!) {
    menuDelete(id: $id) {
      deletedMenuId
      userErrors {
        field
        message
      }
    }
  }
`;
